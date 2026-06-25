import "./mux-video-element"
import { defaultState } from "../core/fake-provider"
import { buildImageUrl, detectIOS } from "./urls"
import type { MediaState, Provider, PlayerActions, QualityLevel, TextTrackInfo } from "../core/types"

export type MuxProviderOptions = {
  playbackId: string
  tokens?: { playback?: string; thumbnail?: string; storyboard?: string }
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  envKey?: string
  poster?: string
  autoPlay?: boolean
  defaultRate?: number
}

// Minimal structural type of the mux-video element we touch.
type MuxVideoEl = HTMLVideoElement & {
  playbackId?: string
  metadata?: Record<string, unknown>
  envKey?: string
  videoRenditions?: {
    length: number
    selectedIndex: number
    [i: number]: { id: string; height: number; bitrate: number; selected: boolean }
    addEventListener(t: string, cb: () => void): void
    removeEventListener(t: string, cb: () => void): void
  }
}

export function createMuxProvider(opts: MuxProviderOptions): Provider {
  const ios = typeof navigator !== "undefined" && detectIOS(navigator.userAgent)
  let el: MuxVideoEl | null = null
  let renditions: MuxVideoEl["videoRenditions"] | null = null
  let state: MediaState = {
    ...defaultState(),
    rate: opts.defaultRate ?? 1,
    storyboard: { vttUrl: buildImageUrl(opts.playbackId, "storyboard", opts.tokens?.storyboard) },
    capabilities: {
      canSetQuality: !ios,
      hasStoryboard: true,
      canPiP: typeof document !== "undefined" && "pictureInPictureEnabled" in document,
      canFullscreen: !ios,
      canSetRate: true,
      hasTextTracks: true,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => { state = { ...state, ...p }; emit() }

  const onFullscreenChange = () => patch({ fullscreen: document.fullscreenElement != null })
  const onEnterPip = () => patch({ pip: true })
  const onLeavePip = () => patch({ pip: false })

  const readQualities = (): QualityLevel[] => {
    const r = el?.videoRenditions
    if (!r) return []
    const out: QualityLevel[] = []
    for (let i = 0; i < r.length; i++) {
      const item = r[i]
      if (!item) continue
      out.push({ id: item.id, height: item.height, bitrate: item.bitrate, selected: item.selected })
    }
    return out
  }
  const readTextTracks = (): TextTrackInfo[] => {
    const tt = el?.textTracks
    if (!tt) return []
    const out: TextTrackInfo[] = []
    for (let i = 0; i < tt.length; i++) {
      const t = tt[i]
      if (!t) continue
      if (t.kind !== "subtitles" && t.kind !== "captions") continue
      out.push({ id: t.id || String(i), kind: t.kind, label: t.label, lang: t.language, mode: t.mode })
    }
    return out
  }
  const syncFromEl = () => {
    if (!el) return
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++) ranges.push([el.buffered.start(i), el.buffered.end(i)])
    patch({
      paused: el.paused, currentTime: el.currentTime, duration: el.duration || 0,
      buffered: ranges, rate: el.playbackRate, volume: el.volume, muted: el.muted,
      readyState: el.readyState, seeking: el.seeking, ended: el.ended,
      qualities: readQualities(), textTracks: readTextTracks(),
    })
  }

  const MEDIA_EVENTS = ["play","pause","timeupdate","durationchange","progress","volumechange","ratechange","seeking","seeked","ended","loadedmetadata","canplay","waiting","error"]

  const actions: PlayerActions = {
    play: () => { void el?.play?.() },
    pause: () => el?.pause(),
    seek: (t) => { if (el) el.currentTime = t },
    setRate: (r) => { if (el) el.playbackRate = r },
    setVolume: (v) => { if (el) el.volume = Math.min(1, Math.max(0, v)) },
    setMuted: (m) => { if (el) el.muted = m },
    setQuality: (id) => {
      const r = el?.videoRenditions
      if (!r) return
      if (id === "auto") { r.selectedIndex = -1; patch({ activeQualityId: "auto" }); return }
      for (let i = 0; i < r.length; i++) {
        const item = r[i]
        if (item && item.id === id) { item.selected = true; r.selectedIndex = i }
      }
      patch({ activeQualityId: id })
    },
    setTextTrack: (id) => {
      const tt = el?.textTracks
      if (!tt) return
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i]
        if (!t) continue
        if (t.kind !== "subtitles" && t.kind !== "captions") continue
        t.mode = (t.id || String(i)) === id ? "showing" : "disabled"
      }
      patch({ activeTextTrackId: id })
    },
    enterFullscreen: (wrapper) => { void wrapper.requestFullscreen?.() },
    exitFullscreen: () => { void document.exitFullscreen?.() },
    enterPiP: () => { void el?.requestPictureInPicture?.() },
    exitPiP: () => { void document.exitPictureInPicture?.() },
  }

  return {
    mount(container) {
      el = document.createElement("mux-video") as MuxVideoEl
      el.playbackId = opts.tokens?.playback
        ? `${opts.playbackId}?token=${opts.tokens.playback}`
        : opts.playbackId
      el.setAttribute("crossorigin", "")
      if (opts.poster) el.poster = opts.poster
      if (opts.autoPlay) el.autoplay = true
      el.playbackRate = state.rate
      if (opts.envKey) el.envKey = opts.envKey
      if (opts.metadata) {
        el.metadata = {
          video_id: opts.metadata.videoId,
          video_title: opts.metadata.videoTitle,
          viewer_user_id: opts.metadata.viewerUserId,
        }
      }
      for (const ev of MEDIA_EVENTS) el.addEventListener(ev, syncFromEl)
      renditions = el.videoRenditions ?? null
      renditions?.addEventListener("change", syncFromEl)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      el.addEventListener("enterpictureinpicture", onEnterPip)
      el.addEventListener("leavepictureinpicture", onLeavePip)
      container.appendChild(el)
    },
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
    actions,
    destroy() {
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      renditions?.removeEventListener("change", syncFromEl)
      renditions = null
      if (el) {
        for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, syncFromEl)
        el.removeEventListener("enterpictureinpicture", onEnterPip)
        el.removeEventListener("leavepictureinpicture", onLeavePip)
        el.remove()
      }
      el = null; listeners.clear()
    },
  }
}
