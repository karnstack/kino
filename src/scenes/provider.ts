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
import type { HostCommand, HostEvent } from "./protocol"

type DocumentPiPHost = Window & {
  documentPictureInPicture?: {
    requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
  }
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
}

// The Provider contract plus the scenes-only theme channels. The stage is a
// themed document and the pip window carries its own chrome, so no other
// provider grows these.
export type ScenesProvider = Provider & {
  setSceneTheme(theme: "light" | "dark"): void
  setChromeTheme(theme: "light" | "dark"): void
}

const TRACK_ID = "captions"

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
        break
      case "kino:state":
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
      send({ type: "kino:play" })
      sendMirror({ type: "kino:play" })
    },
    pause: () => {
      send({ type: "kino:pause" })
      sendMirror({ type: "kino:pause" })
    },
    seek: (t) => {
      send({ type: "kino:seek", time: t })
      sendMirror({ type: "kino:seek", time: t })
      // Optimistic time so the scrubber tracks the pointer between state ticks.
      patch({ currentTime: t, activeCueText: readCueText(t) })
    },
    setRate: (r) => {
      pendingRate = r
      desiredRate = r
      send({ type: "kino:setRate", rate: r })
      sendMirror({ type: "kino:setRate", rate: r })
      patch({ rate: r })
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
