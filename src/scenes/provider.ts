import { defaultState } from "../core/fake-provider"
import { parseVtt, cueTextAt, type VttCue } from "./vtt"
import type { MediaState, PlayerActions, Provider } from "../core/types"
import type { HostCommand, HostEvent } from "./protocol"

export type ScenesProviderOptions = {
  // Full URL of the host page, token and sequence already encoded by the caller.
  src: string
  captions?: { src: string; label: string; srclang: string }
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
  let vttCues: VttCue[] = []
  let desiredRate = opts.defaultRate ?? 1
  // Rate held while a setRate command is in flight, so a stale host snapshot
  // taken before the command landed doesn't flicker the speed menu back.
  let pendingRate: number | null = null

  let state: MediaState = {
    ...defaultState(),
    rate: desiredRate,
    muted: opts.muted ?? false,
    capabilities: {
      // The stage is resolution independent DOM; there is no rendition ladder.
      canSetQuality: false,
      hasStoryboard: false,
      // No parent-side media element to promote into PiP.
      canPiP: false,
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
          autoPlay: opts.autoPlay ?? false,
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
      void wrapper.requestFullscreen?.()
    },
    exitFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.()
    },
    enterPiP: () => {},
    exitPiP: () => {},
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
      iframe?.remove()
      iframe = null
      listeners.clear()
    },
  }
}
