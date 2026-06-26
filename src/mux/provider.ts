// Importing this module registers <mux-video> as a custom element (side effect).
import "@mux/mux-video"
import { defaultState } from "../core/fake-provider"
import { buildImageUrl, detectIOS } from "./urls"
import { activeCueText } from "../util/captions"
import type {
  MediaState,
  Provider,
  PlayerActions,
  QualityLevel,
  TextTrackInfo,
  SourceOptions,
} from "../core/types"

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
    [i: number]: {
      id: string
      height: number
      bitrate: number
      selected: boolean
    }
    addEventListener(t: string, cb: () => void): void
    removeEventListener(t: string, cb: () => void): void
  }
  // iPhone has no Element.requestFullscreen; the video element fullscreens itself.
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
}

export function createMuxProvider(opts: MuxProviderOptions): Provider {
  const ios = typeof navigator !== "undefined" && detectIOS(navigator.userAgent)
  let el: MuxVideoEl | null = null
  let renditions: MuxVideoEl["videoRenditions"] | null = null
  let renditionsBound = false
  let state: MediaState = {
    ...defaultState(),
    rate: opts.defaultRate ?? 1,
    storyboard: {
      vttUrl: buildImageUrl(
        opts.playbackId,
        "storyboard",
        opts.tokens?.storyboard,
      ),
    },
    capabilities: {
      canSetQuality: !ios,
      hasStoryboard: true,
      canPiP:
        typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document,
      // iPhone can't fullscreen our custom chrome, but the video element can go
      // fullscreen natively (webkitEnterFullscreen) — so we always offer it.
      canFullscreen: true,
      canSetRate: true,
      hasTextTracks: true,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }

  const onFullscreenChange = () =>
    patch({ fullscreen: document.fullscreenElement != null })
  // iOS native video fullscreen doesn't fire document fullscreenchange; the
  // video element fires its own webkit events instead.
  const onWebkitBeginFullscreen = () => patch({ fullscreen: true })
  const onWebkitEndFullscreen = () => patch({ fullscreen: false })
  const onEnterPip = () => patch({ pip: true })
  const onLeavePip = () => patch({ pip: false })

  // Custom captions: keep the active track "hidden" (cues fire but the browser
  // doesn't paint them) and mirror the current cue text into state so the React
  // overlay can render it in our own styled box.
  let activeTrack: TextTrack | null = null
  // iOS plays HLS natively and drops the cues of a "hidden" track, so our custom
  // overlay would have nothing to paint. There we let the native track render
  // itself ("showing", below) and keep our overlay text empty to avoid doubling.
  const readCueText = (): string =>
    ios ? "" : activeCueText(el?.textTracks, el?.currentTime ?? 0)
  // hls.js only fetches & parses a subtitle playlist while the track mode is
  // "showing"; a track set straight to "hidden" never loads its cues, so our
  // overlay would have nothing to render. Keep the chosen track "showing" until
  // its cues arrive, then flip to "hidden" so the browser stops painting them
  // and our <Captions> box is the only thing on screen. Loaded cues survive the
  // flip, so this also re-asserts the moment cues come in.
  const modeForActiveTrack = (t: TextTrack): "showing" | "hidden" =>
    ios ? "showing" : t.cues && t.cues.length > 0 ? "hidden" : "showing"
  const onCueChange = () => {
    // Cues becoming active is our cue (sic) that hls.js finished loading them —
    // flip "showing" → "hidden" immediately to minimize any native-render flash.
    applyTextTrackModes()
    patch({ activeCueText: readCueText() })
  }
  const bindActiveTrack = (track: TextTrack | null) => {
    if (activeTrack) activeTrack.removeEventListener("cuechange", onCueChange)
    activeTrack = track
    if (activeTrack) activeTrack.addEventListener("cuechange", onCueChange)
    patch({ activeCueText: readCueText() })
  }
  // hls.js adds (and sometimes replaces) the subtitle TextTrack asynchronously
  // after the manifest parses, so re-assert our chosen mode whenever the track
  // list changes — otherwise an enabled caption silently reverts to disabled.
  const applyTextTrackModes = () => {
    const tt = el?.textTracks
    if (!tt) return
    const id = state.activeTextTrackId
    let next: TextTrack | null = null
    for (let i = 0; i < tt.length; i++) {
      const t = tt[i]
      if (!t) continue
      if (t.kind !== "subtitles" && t.kind !== "captions") continue
      if (id != null && (t.id || String(i)) === id) {
        const mode = modeForActiveTrack(t)
        if (t.mode !== mode) t.mode = mode
        next = t
      } else if (t.mode !== "disabled") {
        t.mode = "disabled"
      }
    }
    if (next !== activeTrack) bindActiveTrack(next)
  }
  const onTextTracksChanged = () => {
    applyTextTrackModes()
    patch({ textTracks: readTextTracks(), activeCueText: readCueText() })
  }

  const readQualities = (): QualityLevel[] => {
    const r = el?.videoRenditions
    if (!r) return []
    const out: QualityLevel[] = []
    for (let i = 0; i < r.length; i++) {
      const item = r[i]
      if (!item) continue
      out.push({
        id: item.id,
        height: item.height,
        bitrate: item.bitrate,
        selected: item.selected,
      })
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
      out.push({
        id: t.id || String(i),
        kind: t.kind,
        label: t.label,
        lang: t.language,
        mode: t.mode,
      })
    }
    return out
  }
  // Renditions populate after metadata loads, so el.videoRenditions is usually
  // undefined at mount time. Bind the "change" listener lazily and once.
  const bindRenditions = () => {
    if (renditionsBound || !el?.videoRenditions) return
    renditions = el.videoRenditions
    renditions.addEventListener("change", syncFromEl)
    renditionsBound = true
  }
  const syncFromEl = () => {
    if (!el) return
    bindRenditions()
    // Re-assert track modes every tick: once a "showing" track's cues finish
    // loading this flips it to "hidden" (progress fires while paused too).
    applyTextTrackModes()
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++)
      ranges.push([el.buffered.start(i), el.buffered.end(i)])
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
      error: el.error
        ? { code: el.error.code, message: el.error.message }
        : null,
      qualities: readQualities(),
      textTracks: readTextTracks(),
      videoHeight: el.videoHeight || 0,
      // Recompute on every tick too: cuechange alone is unreliable over HLS.
      activeCueText: readCueText(),
    })
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = el.paused ? "paused" : "playing"
    }
  }

  // Wire OS / hardware media keys (e.g. the Mac play-pause key) to the player.
  const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
    "play",
    "pause",
    "seekbackward",
    "seekforward",
    "seekto",
  ]
  const setupMediaSession = () => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    const ms = navigator.mediaSession
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(a, h)
      } catch {
        /* unsupported action */
      }
    }
    set("play", () => actions.play())
    set("pause", () => actions.pause())
    set("seekbackward", (d) =>
      actions.seek(Math.max(0, state.currentTime - (d.seekOffset || 10))),
    )
    set("seekforward", (d) =>
      actions.seek(state.currentTime + (d.seekOffset || 10)),
    )
    set("seekto", (d) => {
      if (typeof d.seekTime === "number") actions.seek(d.seekTime)
    })
    if (typeof MediaMetadata !== "undefined") {
      try {
        ms.metadata = new MediaMetadata({
          title: opts.metadata?.videoTitle ?? "Video",
        })
      } catch {
        /* ignore */
      }
    }
  }
  const teardownMediaSession = () => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    for (const a of MEDIA_SESSION_ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(a, null)
      } catch {
        /* ignore */
      }
    }
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
    setQuality: (id) => {
      const r = el?.videoRenditions
      if (!r) return
      if (id === "auto") {
        r.selectedIndex = -1
        patch({ activeQualityId: "auto" })
        return
      }
      for (let i = 0; i < r.length; i++) {
        const item = r[i]
        if (item && item.id === id) {
          item.selected = true
          r.selectedIndex = i
        }
      }
      patch({ activeQualityId: id })
    },
    setTextTrack: (id) => {
      if (!el?.textTracks) return
      // Record the choice, then let applyTextTrackModes own the actual modes: it
      // starts the chosen track "showing" so hls.js fetches the cues and flips
      // it to "hidden" once they land (see modeForActiveTrack).
      patch({ activeTextTrackId: id })
      applyTextTrackModes()
    },
    enterFullscreen: (wrapper) => {
      // Prefer fullscreening our custom chrome (wrapper) so the kino controls
      // stay visible. iPhone doesn't support that — fall back to the video
      // element's native fullscreen.
      if (wrapper.requestFullscreen) void wrapper.requestFullscreen()
      else el?.webkitEnterFullscreen?.()
    },
    exitFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.()
      else el?.webkitExitFullscreen?.()
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
      el = document.createElement("mux-video") as MuxVideoEl
      el.playbackId = opts.tokens?.playback
        ? `${opts.playbackId}?token=${opts.tokens.playback}`
        : opts.playbackId
      el.setAttribute("crossorigin", "")
      // Keep playback inline on iOS. Without this the video promotes to the
      // native fullscreen player on play — showing native controls on top of
      // our own ("double controls").
      el.setAttribute("playsinline", "")
      el.playsInline = true
      el.poster =
        opts.poster ??
        buildImageUrl(opts.playbackId, "thumbnail", opts.tokens?.thumbnail)
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
      // videoRenditions is not yet available here; bound lazily in syncFromEl.
      document.addEventListener("fullscreenchange", onFullscreenChange)
      el.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen)
      el.addEventListener("webkitendfullscreen", onWebkitEndFullscreen)
      el.addEventListener("enterpictureinpicture", onEnterPip)
      el.addEventListener("leavepictureinpicture", onLeavePip)
      container.appendChild(el)
      // textTracks exists once the element is connected; subtitle tracks are
      // added later by the engine, so react to the list changing.
      el.textTracks?.addEventListener("addtrack", onTextTracksChanged)
      el.textTracks?.addEventListener("removetrack", onTextTracksChanged)
      el.textTracks?.addEventListener("change", onTextTracksChanged)
      setupMediaSession()
    },
    swapSource(opts: SourceOptions) {
      // Change the source on the existing element: no createElement, no remove,
      // and keep the event listeners attached so DOM/fullscreen continuity holds.
      if (!el) return
      if (opts.playbackId != null) {
        el.playbackId = opts.tokens?.playback
          ? `${opts.playbackId}?token=${opts.tokens.playback}`
          : opts.playbackId
      }
      if (opts.poster != null) {
        el.poster = opts.poster
      } else if (opts.playbackId != null) {
        el.poster = buildImageUrl(
          opts.playbackId,
          "thumbnail",
          opts.tokens?.thumbnail,
        )
      }
      if (opts.metadata) {
        el.metadata = {
          video_id: opts.metadata.videoId,
          video_title: opts.metadata.videoTitle,
          viewer_user_id: opts.metadata.viewerUserId,
        }
      }
      patch({
        currentTime: 0,
        duration: 0,
        ended: false,
        seeking: false,
        error: null,
        storyboard:
          opts.playbackId != null
            ? {
                vttUrl: buildImageUrl(
                  opts.playbackId,
                  "storyboard",
                  opts.tokens?.storyboard,
                ),
              }
            : state.storyboard,
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
      teardownMediaSession()
      if (activeTrack) activeTrack.removeEventListener("cuechange", onCueChange)
      activeTrack = null
      if (renditionsBound) renditions?.removeEventListener("change", syncFromEl)
      renditions = null
      renditionsBound = false
      if (el) {
        for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, syncFromEl)
        el.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen)
        el.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen)
        el.removeEventListener("enterpictureinpicture", onEnterPip)
        el.removeEventListener("leavepictureinpicture", onLeavePip)
        el.textTracks?.removeEventListener("addtrack", onTextTracksChanged)
        el.textTracks?.removeEventListener("removetrack", onTextTracksChanged)
        el.textTracks?.removeEventListener("change", onTextTracksChanged)
        el.remove()
      }
      el = null
      listeners.clear()
    },
  }
}
