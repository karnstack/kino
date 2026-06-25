import { defaultState } from "../src/core/fake-provider"
import type {
  MediaState,
  Provider,
  PlayerActions,
  SourceOptions,
} from "../src/core/types"

// Demo-only provider backed by a plain <video> element. It lets the visual
// harness play a real clip without any account or signed tokens, so anyone
// who clones the repo can see and interact with the full kino UI.
export function createFileProvider(src: string, poster?: string): Provider {
  let el: HTMLVideoElement | null = null
  let state: MediaState = {
    ...defaultState(),
    capabilities: {
      canSetQuality: false,
      hasStoryboard: false,
      canPiP: typeof document !== "undefined" && "pictureInPictureEnabled" in document,
      canFullscreen: true,
      canSetRate: true,
      hasTextTracks: false,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  // Replace the whole state object on every change so the store detects updates.
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }

  const onFullscreenChange = () =>
    patch({ fullscreen: document.fullscreenElement != null })
  const onEnterPip = () => patch({ pip: true })
  const onLeavePip = () => patch({ pip: false })

  const syncFromEl = () => {
    if (!el) return
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++) {
      ranges.push([el.buffered.start(i), el.buffered.end(i)])
    }
    patch({
      paused: el.paused,
      currentTime: el.currentTime,
      duration: el.duration || 0,
      buffered: ranges,
      rate: el.playbackRate,
      volume: el.volume,
      muted: el.muted,
      readyState: el.readyState,
      seeking: el.seeking,
      ended: el.ended,
    })
  }

  const MEDIA_EVENTS = [
    "play",
    "pause",
    "timeupdate",
    "durationchange",
    "progress",
    "volumechange",
    "ratechange",
    "seeking",
    "seeked",
    "ended",
    "loadedmetadata",
    "canplay",
    "waiting",
    "error",
  ]

  const actions: PlayerActions = {
    play: () => {
      void el?.play?.()
    },
    pause: () => el?.pause(),
    seek: (t) => {
      if (el) el.currentTime = t
    },
    setRate: (r) => {
      if (el) el.playbackRate = r
    },
    setVolume: (v) => {
      if (el) el.volume = Math.min(1, Math.max(0, v))
    },
    setMuted: (m) => {
      if (el) el.muted = m
    },
    setQuality: () => {},
    setTextTrack: () => {},
    enterFullscreen: (wrapper) => {
      void wrapper.requestFullscreen?.()
    },
    exitFullscreen: () => {
      void document.exitFullscreen?.()
    },
    enterPiP: () => {
      void el?.requestPictureInPicture?.()
    },
    exitPiP: () => {
      void document.exitPictureInPicture?.()
    },
  }

  return {
    mount(container) {
      el = document.createElement("video")
      el.playsInline = true
      el.crossOrigin = "anonymous"
      el.preload = "metadata"
      if (poster) el.poster = poster
      el.src = src
      for (const ev of MEDIA_EVENTS) el.addEventListener(ev, syncFromEl)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      el.addEventListener("enterpictureinpicture", onEnterPip)
      el.addEventListener("leavepictureinpicture", onLeavePip)
      container.appendChild(el)
    },
    swapSource(opts: SourceOptions) {
      // Reuse the existing <video> element: change its source and reload,
      // so the element (and any fullscreen session) stays in place.
      if (!el) return
      el.src = opts.src ?? el.src
      if (opts.poster) el.poster = opts.poster
      el.load()
      patch({
        currentTime: 0,
        duration: 0,
        ended: false,
        seeking: false,
        error: null,
      })
    },
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    actions,
    destroy() {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      if (el) {
        for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, syncFromEl)
        el.removeEventListener("enterpictureinpicture", onEnterPip)
        el.removeEventListener("leavepictureinpicture", onLeavePip)
        el.remove()
      }
      el = null
      listeners.clear()
    },
  }
}
