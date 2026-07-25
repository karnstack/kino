import { defaultState } from "../core/fake-provider"
import { enterPseudoFullscreen } from "../util/pseudo-fullscreen"
import {
  mountPipPlaceholder,
  mountPipOverlay,
  pipStageBackdrop,
  type PipOverlay,
} from "./pip-surfaces"
import { parseVtt, cueTextAt, type VttCue } from "./vtt"
import type { MediaState, PlayerActions, Provider } from "../core/types"
import type { HostCommand, HostEvent, HostMediaState } from "./protocol"

type DocumentPiPHost = Window & {
  documentPictureInPicture?: {
    requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
  }
}

/**
 * Ambient preview: on first load the stage plays its opening window muted and
 * loops it, so the player reads as something worth pressing play on instead of
 * a blank frame behind a play button.
 *
 * Throughout, `MediaState` keeps reporting a paused player at time 0 (and the
 * viewer's own volume/muted). Every chrome surface and every consumer already
 * keys off that idle shape, so none of them need to know a preview is running;
 * the real clock lives only inside the host iframe. The first transport action
 * hands the clock back and nothing preview-related runs again.
 */
export type ScenesPreviewOptions = {
  /**
   * End of the looped window, in sequence seconds. The caller derives this
   * from the manifest (the provider never sees one) — the opening scene's
   * boundary is the natural choice, since a window that ends mid-motion
   * restarts mid-motion. Values at or below the settle backoff disable the
   * preview.
   */
  endSeconds: number
  /**
   * Loops before settling; defaults to 2. After the last one the host holds
   * the opening scene's settled final frame, paused, so the player is lively
   * on arrival and calm afterwards rather than animating forever.
   */
  cycles?: number
  /**
   * Speed of the loop, defaulting to 2x. Scenes are driven off the sequence
   * clock rather than wall time, so the whole stage scales cleanly with the
   * rate; the faster pass reads livelier and covers the window in half the
   * time, so the player settles sooner. Independent of the viewer's own rate,
   * which is restored when they take the clock back.
   */
  rate?: number
}

export type ScenesProviderOptions = {
  // Full URL of the host page, token and sequence already encoded by the caller.
  src: string
  captions?: { src: string; label: string; srclang: string }
  // Thumbnail VTT for scrubber hover previews: cues whose payload points into
  // a sprite image via #xywh fragments, same format as the Mux storyboard
  // track. Full URL, any auth token already encoded by the caller.
  storyboard?: { vttUrl: string }
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  defaultRate?: number
  autoPlay?: boolean
  muted?: boolean
  // Initial stage theme applied to the host document; defaults to dark.
  theme?: "light" | "dark"
  // Initial chrome theme for the controls drawn over the pip window; defaults
  // to dark. The main tab's chrome is themed by the Player's chromeTheme prop
  // instead, which cannot reach across into the pip document.
  chromeTheme?: "light" | "dark"
  // Ambient first-load preview. Omit for a still, idle player. Ignored when
  // autoPlay is set, which already starts the real thing.
  preview?: ScenesPreviewOptions
}

// The Provider contract plus the scenes-only theme channels. The stage is a
// themed document and the pip window carries its own chrome, so no other
// provider grows these.
export type ScenesProvider = Provider & {
  setSceneTheme(theme: "light" | "dark"): void
  setChromeTheme(theme: "light" | "dark"): void
}

const TRACK_ID = "captions"

const PREVIEW_DEFAULT_CYCLES = 2
// Default loop speed. Scenes compute everything from the sequence clock (the
// render path drives them under a fake clock, so wall-time CSS transitions
// would not survive it), which means the stage scales cleanly with the rate
// instead of desyncing. Double speed reads livelier and halves how long the
// player animates before it settles.
const PREVIEW_DEFAULT_RATE = 2
// How far back from the window's end the settled frame sits. Far enough inside
// the opening scene that the clock cannot tip into the next one, close enough
// that the scene is holding its final state rather than still animating.
const PREVIEW_SETTLE_BACKOFF_S = 0.15
// Muted autoplay is allowed by policy everywhere that matters, but iOS low
// power mode refuses it outright. If the host has not reported itself playing
// by now, treat it as refused and settle instead of waiting forever.
const PREVIEW_START_GRACE_MS = 800
// A snapshot the host queued before a seek landed can report the old clock.
// Anything inside this window of the seek target counts as the host agreeing.
const PREVIEW_RESUME_EPSILON_S = 0.5

type NormalizedPreview = {
  end: number
  cycles: number
  rate: number
  settleAt: number
}

function normalizePreview(
  opts: ScenesProviderOptions,
): NormalizedPreview | null {
  const preview = opts.preview
  // autoPlay is the viewer starting the real thing; there is nothing to tease.
  if (!preview || opts.autoPlay) return null
  const end = preview.endSeconds
  // Too short to settle inside means too short to be worth looping.
  if (!Number.isFinite(end) || end <= PREVIEW_SETTLE_BACKOFF_S) return null
  const cycles = Math.max(
    1,
    Math.floor(preview.cycles ?? PREVIEW_DEFAULT_CYCLES),
  )
  // A zero or negative rate would stall the loop at the first frame, and the
  // grace timer would read that as refused autoplay and settle it.
  const rate =
    Number.isFinite(preview.rate) && (preview.rate ?? 0) > 0
      ? (preview.rate as number)
      : PREVIEW_DEFAULT_RATE
  return { end, cycles, rate, settleAt: end - PREVIEW_SETTLE_BACKOFF_S }
}

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean }
}

// Reasons never to run the preview, checked once at the handshake.
function previewSuppressed(): boolean {
  if (typeof window === "undefined") return true
  // Someone who asked for less motion did not ask for a looping animation.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true)
    return true
  // On a metered connection the opening window would be fetched for nothing
  // whenever the viewer never presses play.
  if ((navigator as NavigatorWithConnection).connection?.saveData === true)
    return true
  return false
}

// Plays an audio-driven React scene sequence hosted in an iframe. The iframe
// owns the audio element and the scene DOM; this side only speaks the wire
// protocol and adapts it to kino's Provider contract.
export function createScenesProvider(
  opts: ScenesProviderOptions,
): ScenesProvider {
  // Resolved lazily in mount(): on a server there is no location to resolve
  // a relative src against, and mount only ever runs in a browser. Before
  // mount nothing sends or receives, so the empty origin is never used.
  let origin = ""
  const resolveOrigin = (): string => {
    try {
      return new URL(
        opts.src,
        typeof location !== "undefined" ? location.href : undefined,
      ).origin
    } catch {
      throw new Error(
        `kino scenes: could not resolve the host origin from src "${opts.src}"; a relative src requires a browser environment or an absolute URL`,
      )
    }
  }
  let iframe: HTMLIFrameElement | null = null
  let mountContainer: HTMLElement | null = null
  let pipWindow: (Window & { close(): void }) | null = null
  // True from the enterPiP guard until requestWindow settles, so a second
  // click cannot start a parallel request that would overwrite the first
  // window's wiring.
  let pipEntering = false
  let pipCleanups: Array<() => void> = []
  let onPipPagehide: (() => void) | null = null
  // Muted mirror shown in the pip window while pip is active. The master
  // iframe never moves (a cross-document move reloads it, and the reloaded
  // document cannot autoplay audibly: its activation would have to come from
  // the pip window, which never has any); the mirror is a second host
  // instance whose only job is visuals.
  let mirrorIframe: HTMLIFrameElement | null = null
  // Last clock reported by the mirror, for drift correction against the
  // master. Null until the mirror's first state tick.
  let mirrorTime: number | null = null
  let vttCues: VttCue[] = []
  let desiredRate = opts.defaultRate ?? 1
  // Stage theme forwarded to the host document. Dark is canonical; anything
  // but the two literals falls back to it.
  let theme: "light" | "dark" = opts.theme === "light" ? "light" : "dark"
  // Chrome theme for the pip window's own controls. Same fallback rule, and
  // it seeds every pip window opened from here, not just the first.
  let chromeTheme: "light" | "dark" =
    opts.chromeTheme === "light" ? "light" : "dark"
  // Live overlay handle while pip is open, so a theme flip mid-session
  // restyles it in place. Null outside pip.
  let pipOverlay: PipOverlay | null = null
  // Rate held while a setRate command is in flight, so a stale host snapshot
  // taken before the command landed doesn't flicker the speed menu back.
  let pendingRate: number | null = null
  // Restore fn while pseudo-fullscreen (no Element.requestFullscreen, i.e.
  // iPhone-class WebKit) is active. Null otherwise.
  let pseudoRestore: (() => void) | null = null

  // Ambient preview. Null when not configured, suppressed, or superseded by
  // autoPlay; the phase below then never leaves "off".
  const preview = normalizePreview(opts)
  //   "off"      never configured, or the viewer has taken the clock back
  //   "waiting"  configured; the host is untouched, still idle at its start
  //   "running"  muted loop in flight
  //   "settled"  loop finished (or was refused); host paused on the opening
  //              scene's final frame
  // "running" and "settled" both mean the host clock is somewhere the viewer
  // did not put it, so both suppress state snapshots and both must be released
  // with an explicit seek before real playback.
  let previewPhase: "off" | "waiting" | "running" | "settled" = "off"
  let previewCyclesLeft = 0
  let previewGrace: ReturnType<typeof setTimeout> | null = null
  let previewObserver: IntersectionObserver | null = null
  // Seek target from the hand-back, held until the host's own clock agrees, so
  // a snapshot queued before that seek cannot flash the preview clock into the
  // scrubber. Null outside the hand-back.
  let previewResumeAt: number | null = null
  // True from a loop seek until the host's clock has actually come back, so a
  // snapshot queued at the window's end before that seek landed cannot burn a
  // second cycle.
  let previewRewinding = false
  const previewHoldsClock = () =>
    previewPhase === "running" || previewPhase === "settled"

  let state: MediaState = {
    ...defaultState(),
    rate: desiredRate,
    muted: opts.muted ?? false,
    storyboard: opts.storyboard ? { vttUrl: opts.storyboard.vttUrl } : null,
    capabilities: {
      // The stage is resolution independent DOM; there is no rendition ladder.
      canSetQuality: false,
      hasStoryboard: opts.storyboard != null,
      // No media element to promote, but the whole stage can move into a
      // document pip window where supported.
      canPiP:
        typeof window !== "undefined" &&
        (window as DocumentPiPHost).documentPictureInPicture != null,
      canFullscreen: true,
      canSetRate: true,
      hasTextTracks: opts.captions != null,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }

  // Leave pseudo-fullscreen if it is active, mirroring exitFullscreen.
  const clearPseudoFullscreen = () => {
    if (!pseudoRestore) return
    pseudoRestore()
    pseudoRestore = null
    patch({ fullscreen: false })
  }

  // A freshly created iframe holds an about:blank document that inherits THIS
  // page's origin until the real host document loads, so a command targeted at
  // the host origin is refused outright ("The target origin provided does not
  // match the recipient window's origin") and lands as a console error. The
  // handshake is the earliest point the host is both on its own origin and
  // listening, so nothing goes out before it. Nothing is lost: the pre-ready
  // rate, volume, muted and theme all ride the kino:init reply.
  let ready = false
  const send = (cmd: HostCommand) => {
    if (!ready) return
    iframe?.contentWindow?.postMessage(cmd, origin)
  }

  // Same rule for the mirror, which is about:blank on the pip window's origin
  // until it loads. False outside pip too, so this is a no-op there.
  let mirrorReady = false
  const sendMirror = (cmd: HostCommand) => {
    if (!mirrorReady) return
    mirrorIframe?.contentWindow?.postMessage(cmd, origin)
  }

  const readCueText = (t: number): string =>
    state.activeTextTrackId === TRACK_ID ? cueTextAt(vttCues, t) : ""

  const clearPreviewGrace = () => {
    if (previewGrace === null) return
    clearTimeout(previewGrace)
    previewGrace = null
  }

  const stopPreviewObserver = () => {
    previewObserver?.disconnect()
    previewObserver = null
  }

  // End of the loop: hold the opening scene's settled final frame. Also the
  // landing spot when muted autoplay was refused, which is why it is a still
  // frame of real content and not a blank stage.
  const settlePreview = () => {
    if (previewPhase !== "running") return
    previewPhase = "settled"
    clearPreviewGrace()
    send({ type: "kino:pause" })
    send({ type: "kino:seek", time: preview?.settleAt ?? 0 })
  }

  // Start the muted loop. Separate from the kino:init reply so the deferred
  // (offscreen) start goes through exactly the same path as the immediate one.
  const startPreview = () => {
    if (!preview || previewPhase !== "waiting") return
    stopPreviewObserver()
    previewPhase = "running"
    previewCyclesLeft = preview.cycles
    // Muted before playing: the muted-autoplay exemption is what lets this
    // start without any user activation.
    send({ type: "kino:setMuted", muted: true })
    // The loop's own rate, not the viewer's: the tease runs at one deliberate
    // speed for everyone. Theirs rides the hand-back.
    send({ type: "kino:setRate", rate: preview.rate })
    send({ type: "kino:seek", time: 0 })
    send({ type: "kino:play" })
    previewGrace = setTimeout(settlePreview, PREVIEW_START_GRACE_MS)
  }

  // Hand the clock back to the viewer, who wants it at `time`. Leaves the host
  // paused there with their own audio settings restored, and retires the
  // preview for the life of this provider. A no-op once the preview is off, so
  // every transport action can call it unconditionally.
  const releasePreview = (time: number) => {
    if (previewPhase === "off") return
    const disturbed = previewHoldsClock()
    previewPhase = "off"
    stopPreviewObserver()
    clearPreviewGrace()
    // "waiting" never touched the host, so there is nothing to undo — and
    // rewinding here would clobber a resume seek that arrived first.
    if (!disturbed) return
    send({ type: "kino:pause" })
    send({ type: "kino:seek", time })
    send({ type: "kino:setMuted", muted: state.muted })
    send({ type: "kino:setVolume", volume: state.volume })
    send({ type: "kino:setRate", rate: desiredRate })
    previewResumeAt = time
    patch({ currentTime: time, activeCueText: readCueText(time) })
  }

  // Drive the loop off the host's state ticks. Coarse by design: at the host's
  // 10Hz the loop point lands within ~100ms of the window's end, which is
  // under the threshold of noticing on an ambient loop.
  const advancePreview = (snapshot: HostMediaState) => {
    if (previewPhase !== "running" || !preview) return
    // Playing means muted autoplay was allowed after all.
    if (!snapshot.paused) clearPreviewGrace()
    if (previewRewinding) {
      if (snapshot.currentTime < preview.end) previewRewinding = false
      return
    }
    if (snapshot.currentTime < preview.end) return
    previewCyclesLeft -= 1
    if (previewCyclesLeft > 0) {
      previewRewinding = true
      send({ type: "kino:seek", time: 0 })
      return
    }
    settlePreview()
  }

  // Arm the preview once the host is listening. Deferred until the player is
  // actually on screen: a lesson opened below the fold would otherwise spend
  // both its loops unwatched and be settled by the time anyone scrolled to it.
  const armPreview = () => {
    if (!preview || previewPhase !== "off") return
    if (previewSuppressed()) return
    previewPhase = "waiting"
    if (typeof IntersectionObserver === "undefined" || !mountContainer) {
      startPreview()
      return
    }
    previewObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) startPreview()
      },
      { threshold: 0.25 },
    )
    previewObserver.observe(mountContainer)
  }

  const onMessage = (ev: MessageEvent) => {
    if (!iframe) return
    if (ev.origin !== origin || ev.source !== iframe.contentWindow) return
    const msg = ev.data as HostEvent
    if (msg == null || typeof msg !== "object") return
    switch (msg.type) {
      case "kino:ready":
        // Set before the reply: send() itself is gated on this.
        ready = true
        patch({ duration: msg.duration })
        send({
          type: "kino:init",
          rate: desiredRate,
          volume: state.volume,
          muted: state.muted,
          autoPlay: opts.autoPlay ?? false,
          theme,
        })
        armPreview()
        break
      case "kino:state":
        // While the ambient preview owns the host clock, MediaState keeps
        // reporting the idle player the chrome and its consumers expect: the
        // loop must not move the scrubber, fire captions, or read as playback
        // to anything watching. Loading progress is not clock state, so
        // buffered/readyState still flow (cross-lesson autoplay arms on the
        // readyState edge, and would otherwise wait for a preview to finish).
        if (previewHoldsClock()) {
          patch({
            buffered: msg.state.buffered,
            readyState: msg.state.readyState,
          })
          advancePreview(msg.state)
          break
        }
        // A snapshot the host queued before the hand-back seek landed still
        // carries the preview clock; drop it rather than flash it.
        if (previewResumeAt !== null) {
          if (
            Math.abs(msg.state.currentTime - previewResumeAt) >
            PREVIEW_RESUME_EPSILON_S
          )
            break
          previewResumeAt = null
        }
        // The host's snapshot is authoritative once it arrives, except while
        // a setRate is in flight: hold the optimistic rate until the host
        // echoes it back, then let snapshots flow through wholly again.
        if (pendingRate !== null && msg.state.rate === pendingRate)
          pendingRate = null
        patch({
          ...msg.state,
          ...(pendingRate !== null ? { rate: pendingRate } : {}),
          activeCueText: readCueText(msg.state.currentTime),
        })
        // Drift correction: the muted mirror free-runs between commands, so
        // nudge it back onto the master clock when it slips past 0.3s.
        if (
          pipWindow &&
          mirrorTime !== null &&
          Math.abs(msg.state.currentTime - mirrorTime) > 0.3
        )
          sendMirror({ type: "kino:seek", time: msg.state.currentTime })
        break
      case "kino:error":
        // MediaState.error.code is numeric; carry the host's string code
        // ("media" | "scene") in the message so it survives the adaptation.
        patch({ error: { code: 0, message: `[${msg.code}] ${msg.message}` } })
        break
      case "kino:scenechange":
        // Not surfaced in MediaState yet; chapters UI is a later addition.
        break
    }
  }

  // The mirror host posts to its window.parent, which is the pip window, so
  // this listener lives on the pip window, not on the main one. Mirror state
  // never patches MediaState; the master stays the single source of truth.
  const onMirrorMessage = (ev: MessageEvent) => {
    if (!mirrorIframe) return
    if (ev.origin !== origin || ev.source !== mirrorIframe.contentWindow) return
    const msg = ev.data as HostEvent
    if (msg == null || typeof msg !== "object") return
    switch (msg.type) {
      case "kino:ready": {
        // Set before the reply: sendMirror() itself is gated on this.
        mirrorReady = true
        // A non-finite currentTime would flow through init startTime straight
        // into audio.currentTime in the mirror; fall back to the start.
        const t = state.currentTime
        // Muted autoplay is always allowed by policy, so the mirror starts
        // in lockstep without any user activation in the pip window.
        sendMirror({
          type: "kino:init",
          rate: state.rate,
          volume: 0,
          muted: true,
          autoPlay: !state.paused,
          startTime: Number.isFinite(t) ? t : 0,
          // The current theme, not the mount-time option: it may have
          // flipped since, and the mirror must come up matching the master.
          theme,
        })
        break
      }
      case "kino:state":
        mirrorTime = msg.state.currentTime
        break
    }
  }

  // The pip body shows through until the mirrored stage paints, so it tracks
  // the stage theme; a hardcoded black flashed black under a light stage.
  const applyPipBackdrop = (win: Window) => {
    win.document.body.style.background = pipStageBackdrop(theme)
    win.document.documentElement.style.colorScheme = theme
  }

  const onFullscreenChange = () =>
    patch({ fullscreen: document.fullscreenElement != null })

  // Transport commands drive the mirror alongside the master while pip is
  // active (sendMirror no-ops otherwise). setVolume/setMuted deliberately
  // never fan out: the mirror stays muted forever.
  const actions: PlayerActions = {
    play: () => {
      // Taking over from the ambient preview starts the lesson at the top: the
      // preview is a tease of the opening, not progress through it.
      releasePreview(0)
      send({ type: "kino:play" })
      sendMirror({ type: "kino:play" })
    },
    pause: () => {
      releasePreview(0)
      send({ type: "kino:pause" })
      sendMirror({ type: "kino:pause" })
    },
    seek: (t) => {
      releasePreview(t)
      send({ type: "kino:seek", time: t })
      sendMirror({ type: "kino:seek", time: t })
      // Optimistic time so the scrubber tracks the pointer between state ticks.
      patch({ currentTime: t, activeCueText: readCueText(t) })
    },
    setRate: (r) => {
      pendingRate = r
      desiredRate = r
      patch({ rate: r })
      // Deliberately not a hand-back: the idle speed chips set a rate and then
      // play, so a rate change alone must leave the preview alone. Speeding up
      // the muted loop under the viewer would only look like a glitch; the
      // chosen rate rides the hand-back instead.
      if (previewHoldsClock()) return
      send({ type: "kino:setRate", rate: r })
      sendMirror({ type: "kino:setRate", rate: r })
    },
    setVolume: (v) => {
      const vol = Math.min(1, Math.max(0, v))
      send({ type: "kino:setVolume", volume: vol })
      patch({ volume: vol })
    },
    setMuted: (m) => {
      send({ type: "kino:setMuted", muted: m })
      patch({ muted: m })
    },
    setQuality: () => {},
    setTextTrack: (id) => {
      patch({
        activeTextTrackId: id,
        textTracks: state.textTracks.map((t) => ({
          ...t,
          mode: t.id === id ? "showing" : "disabled",
        })),
      })
      patch({ activeCueText: readCueText(state.currentTime) })
    },
    enterFullscreen: (wrapper) => {
      // The stage lives in another window during pip; the fullscreen button
      // in the main tab has nothing to expand.
      if (pipWindow) return
      if (wrapper.requestFullscreen) {
        void wrapper.requestFullscreen()
        return
      }
      if (pseudoRestore) return
      pseudoRestore = enterPseudoFullscreen(wrapper)
      // No fullscreenchange fires in pseudo mode; own the transition.
      patch({ fullscreen: true })
    },
    exitFullscreen: () => {
      if (pseudoRestore) {
        pseudoRestore()
        pseudoRestore = null
        patch({ fullscreen: false })
        return
      }
      if (document.fullscreenElement) void document.exitFullscreen?.()
    },
    enterPiP: () => {
      void (async () => {
        const dpp = (window as DocumentPiPHost).documentPictureInPicture
        if (!dpp || pipWindow || pipEntering || !iframe || !mountContainer)
          return
        // The mirror comes up on MediaState's clock, so the preview has to be
        // off it before the window opens or the mirror would sync to 0 while
        // the master kept looping behind the inline placeholder.
        releasePreview(0)
        clearPseudoFullscreen()
        pipEntering = true
        let win: Window
        try {
          const w = mountContainer.clientWidth
          const h = mountContainer.clientHeight
          win = await dpp.requestWindow({
            width: 480,
            height: w > 0 && h > 0 ? Math.round((480 * h) / w) : 270,
          })
        } catch {
          pipEntering = false
          return
        }
        pipEntering = false
        // destroy() may have run while requestWindow was pending; wiring the
        // window onto a dead provider would leave it orphaned and unclosable.
        if (!iframe || !mountContainer) {
          win.close()
          return
        }
        // Pseudo-fullscreen may have been entered while the request was
        // pending; clear it the same way as before the await.
        clearPseudoFullscreen()
        pipWindow = win as Window & { close(): void }
        win.document.body.style.margin = "0"
        applyPipBackdrop(win)
        // The pip document may be standards-mode with an auto-height body,
        // which would collapse the percentage-height mirror to 150px.
        win.document.documentElement.style.height = "100%"
        win.document.body.style.height = "100%"
        // The master iframe stays home, keeps playing, and stays the single
        // source of truth; the opaque placeholder below covers it. The pip
        // window gets a muted mirror instead, initialized onto the master
        // clock by onMirrorMessage once it announces ready.
        const mirror = win.document.createElement("iframe")
        mirror.src = opts.src
        mirror.setAttribute("allow", "autoplay; fullscreen")
        mirror.style.width = "100%"
        mirror.style.height = "100%"
        mirror.style.border = "0"
        mirror.style.display = "block"
        mirrorIframe = mirror
        mirrorTime = null
        // This window's mirror has not announced itself yet, whatever a
        // previous pip session left behind.
        mirrorReady = false
        win.document.body.appendChild(mirror)
        // The mirror host's parent is the pip window, so its events land
        // there, not on the main window.
        win.addEventListener("message", onMirrorMessage)
        const overlay = mountPipOverlay(
          win,
          {
            play: actions.play,
            pause: actions.pause,
            getState: () => state,
            subscribe: (l) => {
              listeners.add(l)
              return () => listeners.delete(l)
            },
          },
          chromeTheme,
        )
        pipOverlay = overlay
        pipCleanups = [
          mountPipPlaceholder(mountContainer, actions.exitPiP),
          () => {
            overlay.destroy()
            pipOverlay = null
          },
        ]
        onPipPagehide = () => {
          if (!pipWindow) return
          const closing = pipWindow
          pipWindow = null
          closing.removeEventListener("message", onMirrorMessage)
          if (onPipPagehide)
            closing.removeEventListener("pagehide", onPipPagehide)
          onPipPagehide = null
          mirrorIframe?.remove()
          mirrorIframe = null
          mirrorTime = null
          mirrorReady = false
          pipCleanups.forEach((c) => c())
          pipCleanups = []
          // Nothing to resume: the master never stopped.
          patch({ pip: false })
        }
        win.addEventListener("pagehide", onPipPagehide)
        patch({ pip: true })
      })()
    },
    exitPiP: () => {
      pipWindow?.close()
    },
  }

  const loadCaptions = () => {
    if (!opts.captions) return
    const { src, label, srclang } = opts.captions
    patch({
      textTracks: [
        {
          id: TRACK_ID,
          kind: "subtitles",
          label,
          lang: srclang,
          mode: "disabled",
        },
      ],
    })
    void fetch(src)
      .then((r) => r.text())
      .then((text) => {
        vttCues = parseVtt(text)
        patch({ activeCueText: readCueText(state.currentTime) })
      })
      .catch(() => {
        // Captions are an enhancement; a failed fetch just leaves the track empty.
      })
  }

  return {
    mount(container) {
      mountContainer = container
      origin = resolveOrigin()
      iframe = document.createElement("iframe")
      iframe.src = opts.src
      // Delegate the parent's user activation into the frame; without this
      // audio.play() inside the iframe is blocked by autoplay policy.
      iframe.setAttribute("allow", "autoplay; fullscreen")
      iframe.style.width = "100%"
      iframe.style.height = "100%"
      iframe.style.border = "0"
      iframe.style.display = "block"
      window.addEventListener("message", onMessage)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      container.appendChild(iframe)
      loadCaptions()
    },
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    actions,
    // Follows the embedding site's live theme toggle. Fans out to the pip
    // mirror alongside the master (sendMirror no-ops outside pip).
    setSceneTheme(next) {
      theme = next === "light" ? "light" : "dark"
      send({ type: "kino:setTheme", theme })
      sendMirror({ type: "kino:setTheme", theme })
      // The mirror repaints the stage; the window behind it repaints here.
      if (pipWindow) applyPipBackdrop(pipWindow)
    },
    // Themes the controls drawn over the pip window. A flip while pip is open
    // restyles it in place; otherwise it just seeds the next window.
    setChromeTheme(next) {
      chromeTheme = next === "light" ? "light" : "dark"
      pipOverlay?.setTheme(chromeTheme)
    },
    destroy() {
      window.removeEventListener("message", onMessage)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      stopPreviewObserver()
      clearPreviewGrace()
      previewPhase = "off"
      pseudoRestore?.()
      pseudoRestore = null
      // Fires the pagehide handler, which removes the mirror and clears pip
      // state before the teardown below.
      pipWindow?.close()
      iframe?.remove()
      iframe = null
      ready = false
      mountContainer = null
      listeners.clear()
    },
  }
}
