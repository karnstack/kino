import { defaultState } from "../core/fake-provider"
import { enterPseudoFullscreen } from "../util/pseudo-fullscreen"
import { mountPipPlaceholder, mountPipOverlay } from "./pip-surfaces"
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
}

const TRACK_ID = "captions"

// Plays an audio-driven React scene sequence hosted in an iframe. The iframe
// owns the audio element and the scene DOM; this side only speaks the wire
// protocol and adapts it to kino's Provider contract.
export function createScenesProvider(opts: ScenesProviderOptions): Provider {
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
  // click cannot start a parallel request that would wipe the resume point
  // or overwrite the first window's wiring.
  let pipEntering = false
  let pipCleanups: Array<() => void> = []
  let onPipPagehide: (() => void) | null = null
  // Resume point captured before an iframe-reloading move (into or out of
  // the pip window); consumed by the next kino:ready.
  let resume: { time: number; playing: boolean } | null = null
  let vttCues: VttCue[] = []
  let desiredRate = opts.defaultRate ?? 1
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

  const captureResume = () => {
    // A non-finite currentTime would flow through init startTime straight
    // into audio.currentTime in the host; fall back to the start.
    const t = state.currentTime
    resume = { time: Number.isFinite(t) ? t : 0, playing: !state.paused }
  }

  // Leave pseudo-fullscreen if it is active, mirroring exitFullscreen.
  const clearPseudoFullscreen = () => {
    if (!pseudoRestore) return
    pseudoRestore()
    pseudoRestore = null
    patch({ fullscreen: false })
  }

  const send = (cmd: HostCommand) => {
    iframe?.contentWindow?.postMessage(cmd, origin)
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
        patch({ duration: msg.duration })
        send({
          type: "kino:init",
          rate: desiredRate,
          volume: state.volume,
          muted: state.muted,
          ...(resume
            ? { autoPlay: resume.playing, startTime: resume.time }
            : { autoPlay: opts.autoPlay ?? false }),
        })
        resume = null
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

  const onFullscreenChange = () =>
    patch({ fullscreen: document.fullscreenElement != null })

  const actions: PlayerActions = {
    play: () => send({ type: "kino:play" }),
    pause: () => send({ type: "kino:pause" }),
    seek: (t) => {
      send({ type: "kino:seek", time: t })
      // Optimistic time so the scrubber tracks the pointer between state ticks.
      patch({ currentTime: t, activeCueText: readCueText(t) })
    },
    setRate: (r) => {
      pendingRate = r
      desiredRate = r
      send({ type: "kino:setRate", rate: r })
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
        captureResume()
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
          resume = null
          return
        }
        pipEntering = false
        // destroy() may have run while requestWindow was pending; wiring the
        // window onto a dead provider would leave it orphaned and unclosable.
        if (!iframe || !mountContainer) {
          win.close()
          resume = null
          return
        }
        // Pseudo-fullscreen may have been entered while the request was
        // pending; clear it the same way as before the await.
        clearPseudoFullscreen()
        pipWindow = win as Window & { close(): void }
        win.document.body.style.margin = "0"
        win.document.body.style.background = "#000"
        // The pip document may be standards-mode with an auto-height body,
        // which would collapse the percentage-height iframe to 150px.
        win.document.documentElement.style.height = "100%"
        win.document.body.style.height = "100%"
        // Cross-document move; the iframe reloads and the resume point
        // above replays through kino:init.
        win.document.body.appendChild(iframe)
        // Inside the pip window the host's parent is the pip window, so its
        // events land there, not on the main window.
        win.addEventListener("message", onMessage)
        pipCleanups = [
          mountPipPlaceholder(mountContainer, actions.exitPiP),
          mountPipOverlay(win, {
            play: actions.play,
            pause: actions.pause,
            getState: () => state,
            subscribe: (l) => {
              listeners.add(l)
              return () => listeners.delete(l)
            },
          }),
        ]
        onPipPagehide = () => {
          if (!pipWindow) return
          const closing = pipWindow
          pipWindow = null
          closing.removeEventListener("message", onMessage)
          if (onPipPagehide)
            closing.removeEventListener("pagehide", onPipPagehide)
          onPipPagehide = null
          pipCleanups.forEach((c) => c())
          pipCleanups = []
          // Position advanced while in pip; capture again for the reload
          // caused by moving the iframe home.
          captureResume()
          if (iframe && mountContainer) mountContainer.appendChild(iframe)
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
    destroy() {
      window.removeEventListener("message", onMessage)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      pseudoRestore?.()
      pseudoRestore = null
      // Fires the pagehide handler, which moves the iframe back and clears
      // pip state before the teardown below.
      pipWindow?.close()
      iframe?.remove()
      iframe = null
      mountContainer = null
      listeners.clear()
    },
  }
}
