import { defaultState } from "../core/fake-provider"
import { detectIOS } from "../util/platform"
import { activeCueText } from "../util/captions"
import type {
  MediaState,
  Provider,
  PlayerActions,
  TextTrackInfo,
  SourceOptions,
} from "../core/types"

// A subtitle/caption sidecar for a raw file. Mirrors the attributes of a
// <track> element; kino renders the cues in its own styled overlay.
export type NativeTextTrack = {
  src: string
  srclang: string
  label: string
  kind?: "subtitles" | "captions" // defaults to "subtitles"
  default?: boolean // start showing this track
}

export type NativeProviderOptions = {
  // Raw media URL the <video> element plays directly (mp4, webm, ogg, …).
  src: string
  poster?: string
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  defaultRate?: number
  muted?: boolean
  loop?: boolean
  // Set when the media is cross-origin and you need its pixels/cues readable
  // (e.g. for canvas or sidecar captions). Maps to the element's crossorigin.
  crossOrigin?: "anonymous" | "use-credentials"
  tracks?: NativeTextTrack[]
}

export function createNativeProvider(opts: NativeProviderOptions): Provider {
  const ios =
    typeof navigator !== "undefined" &&
    detectIOS(navigator.userAgent, navigator.maxTouchPoints)
  const tracks = opts.tracks ?? []
  let el: HTMLVideoElement | null = null
  let state: MediaState = {
    ...defaultState(),
    rate: opts.defaultRate ?? 1,
    muted: opts.muted ?? false,
    activeTextTrackId: null,
    capabilities: {
      // A raw file has no rendition ladder, so there is nothing to switch.
      canSetQuality: false,
      hasStoryboard: false,
      canPiP:
        typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document,
      // iPhone can't fullscreen our custom chrome, but the video element can go
      // fullscreen natively (webkitEnterFullscreen) — so we always offer it.
      canFullscreen: true,
      canSetRate: true,
      hasTextTracks: tracks.length > 0,
    },
  }
  // The viewer's chosen rate. A source swap (setting .src) can reset the
  // element's playbackRate to 1x, so we re-assert this after every load (see
  // syncFromEl) and always report it as state.rate so the reset never surfaces.
  let desiredRate = opts.defaultRate ?? 1
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }
  // load() kicks off the resource selection algorithm. Setting .src already does
  // this in browsers; the explicit call forces a reload and is how you release a
  // source on teardown. jsdom doesn't implement it — swallow that.
  const reload = () => {
    try {
      el?.load()
    } catch {
      /* jsdom / unsupported */
    }
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
  // overlay can render it in our own styled box. iOS plays/fullscreens the
  // <video> natively and would drop a hidden track's cues, so there we let the
  // native track render itself ("showing") and keep our overlay text empty.
  let activeTrack: TextTrack | null = null
  const readCueText = (): string =>
    ios ? "" : activeCueText(el?.textTracks, el?.currentTime ?? 0)
  const modeForActiveTrack = (): "showing" | "hidden" =>
    ios ? "showing" : "hidden"
  const onCueChange = () => patch({ activeCueText: readCueText() })
  const bindActiveTrack = (track: TextTrack | null) => {
    if (activeTrack) activeTrack.removeEventListener("cuechange", onCueChange)
    activeTrack = track
    if (activeTrack) activeTrack.addEventListener("cuechange", onCueChange)
    patch({ activeCueText: readCueText() })
  }
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
        const mode = modeForActiveTrack()
        if (t.mode !== mode) t.mode = mode
        next = t
      } else if (t.mode !== "disabled") {
        t.mode = "disabled"
      }
    }
    if (next !== activeTrack) bindActiveTrack(next)
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

  const syncFromEl = () => {
    if (!el) return
    // A source swap can reset playbackRate to 1x; re-assert the chosen rate so
    // it survives swaps (this fires on canplay/loadedmetadata/timeupdate).
    if (el.playbackRate !== desiredRate) el.playbackRate = desiredRate
    applyTextTrackModes()
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++)
      ranges.push([el.buffered.start(i), el.buffered.end(i)])
    patch({
      paused: el.paused,
      currentTime: el.currentTime,
      duration: el.duration || 0,
      buffered: ranges,
      rate: desiredRate,
      volume: el.volume,
      muted: el.muted,
      readyState: el.readyState,
      seeking: el.seeking,
      ended: el.ended,
      error: el.error
        ? { code: el.error.code, message: el.error.message }
        : null,
      videoHeight: el.videoHeight || 0,
      textTracks: readTextTracks(),
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
    setSessionMetadata(opts.metadata?.videoTitle ?? "Video")
  }
  // Set the OS media-session title (lock screen / media keys overlay). Called at
  // setup and again on a source swap so the title doesn't go stale.
  const setSessionMetadata = (title: string) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    if (typeof MediaMetadata === "undefined") return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title })
    } catch {
      /* ignore */
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
      desiredRate = r
      if (el) el.playbackRate = r
      // Reflect immediately even before the element's ratechange fires.
      patch({ rate: r })
    },
    setVolume: (v) => {
      if (el) el.volume = Math.min(1, Math.max(0, v))
    },
    setMuted: (m) => {
      if (el) el.muted = m
    },
    // A raw file exposes no rendition ladder; quality is always "auto".
    setQuality: () => {},
    setTextTrack: (id) => {
      if (!el?.textTracks) return
      patch({ activeTextTrackId: id })
      applyTextTrackModes()
    },
    enterFullscreen: (wrapper) => {
      // Prefer fullscreening our custom chrome (wrapper) so the kino controls
      // stay visible. iPhone doesn't support that — fall back to the video
      // element's native fullscreen.
      if (wrapper.requestFullscreen) void wrapper.requestFullscreen()
      else
        (
          el as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
        )?.webkitEnterFullscreen?.()
    },
    exitFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.()
      else
        (
          el as HTMLVideoElement & { webkitExitFullscreen?: () => void }
        )?.webkitExitFullscreen?.()
    },
    enterPiP: () => {
      void el?.requestPictureInPicture?.()
    },
    exitPiP: () => {
      void document.exitPictureInPicture?.()
    },
  }

  const appendTracks = () => {
    if (!el) return
    let activeId: string | null = null
    tracks.forEach((t, i) => {
      const node = document.createElement("track")
      node.kind = t.kind ?? "subtitles"
      node.src = t.src
      node.srclang = t.srclang
      node.label = t.label
      node.id = `kino-track-${i}`
      el!.appendChild(node)
      if (t.default && activeId == null) activeId = node.id
    })
    if (activeId != null) state = { ...state, activeTextTrackId: activeId }
  }

  return {
    mount(container) {
      el = document.createElement("video")
      el.src = opts.src
      // Keep playback inline on iOS. Without this the video promotes to the
      // native fullscreen player on play — showing native controls on top of
      // our own ("double controls").
      el.setAttribute("playsinline", "")
      el.playsInline = true
      el.preload = "metadata"
      if (opts.poster) el.poster = opts.poster
      if (opts.crossOrigin) el.crossOrigin = opts.crossOrigin
      if (opts.muted) el.muted = true
      if (opts.loop) el.loop = true
      if (opts.autoPlay) el.autoplay = true
      el.playbackRate = desiredRate
      for (const ev of MEDIA_EVENTS) el.addEventListener(ev, syncFromEl)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      el.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen)
      el.addEventListener("webkitendfullscreen", onWebkitEndFullscreen)
      el.addEventListener("enterpictureinpicture", onEnterPip)
      el.addEventListener("leavepictureinpicture", onLeavePip)
      appendTracks()
      container.appendChild(el)
      // textTracks exists once the element is connected; <track> elements parse
      // their cues asynchronously, so react to the list/mode changing. (jsdom's
      // TextTrackList is not an EventTarget, hence the function guard.)
      const tt = el.textTracks
      if (tt && typeof tt.addEventListener === "function") {
        tt.addEventListener("addtrack", onTextTracksChanged)
        tt.addEventListener("removetrack", onTextTracksChanged)
        tt.addEventListener("change", onTextTracksChanged)
      }
      applyTextTrackModes()
      setupMediaSession()
    },
    swapSource(next: SourceOptions) {
      // Change the source on the existing element: no createElement, no remove,
      // and keep the event listeners attached so DOM/fullscreen continuity holds.
      if (!el || next.src == null) return
      el.src = next.src
      if (next.poster != null) el.poster = next.poster
      if (next.metadata?.videoTitle != null)
        setSessionMetadata(next.metadata.videoTitle)
      reload()
      el.playbackRate = desiredRate
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
      teardownMediaSession()
      if (activeTrack) activeTrack.removeEventListener("cuechange", onCueChange)
      activeTrack = null
      if (el) {
        for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, syncFromEl)
        el.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen)
        el.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen)
        el.removeEventListener("enterpictureinpicture", onEnterPip)
        el.removeEventListener("leavepictureinpicture", onLeavePip)
        const tt = el.textTracks
        if (tt && typeof tt.removeEventListener === "function") {
          tt.removeEventListener("addtrack", onTextTracksChanged)
          tt.removeEventListener("removetrack", onTextTracksChanged)
          tt.removeEventListener("change", onTextTracksChanged)
        }
        el.removeAttribute("src")
        reload()
        el.remove()
      }
      el = null
      listeners.clear()
    },
  }

  function onTextTracksChanged() {
    applyTextTrackModes()
    patch({ textTracks: readTextTracks(), activeCueText: readCueText() })
  }
}
