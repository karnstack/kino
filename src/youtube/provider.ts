import { defaultState } from "../core/fake-provider"
import type {
  MediaState,
  Provider,
  PlayerActions,
  SourceOptions,
  TextTrackInfo,
} from "../core/types"

// Minimal structural types for the bits of the YouTube IFrame Player API we
// touch. Hand-rolled (like mux's MuxVideoEl) so the provider needs no runtime
// dependency and no global typings package — the API is loaded at runtime.
type YTCaptionTrack = { languageCode: string; displayName?: string }
type YTPlayer = {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  loadVideoById(id: string): void
  setPlaybackRate(rate: number): void
  getPlaybackRate(): number
  setVolume(volume: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  getCurrentTime(): number
  getDuration(): number
  getVideoLoadedFraction(): number
  getPlayerState(): number
  // Undocumented captions module (the only way to drive YouTube's captions
  // through the IFrame API). YouTube renders the cues itself inside the iframe.
  loadModule(module: string): void
  unloadModule(module: string): void
  getOption(module: string, option: string): unknown
  setOption(module: string, option: string, value: unknown): void
  destroy(): void
}
type YTPlayerEvent = { target: YTPlayer; data?: number }
type YTPlayerCtorOptions = {
  videoId: string
  playerVars?: Record<string, unknown>
  events?: {
    onReady?: (e: YTPlayerEvent) => void
    onStateChange?: (e: YTPlayerEvent) => void
    onError?: (e: YTPlayerEvent) => void
  }
}
type YTNamespace = {
  Player: new (el: HTMLElement, opts: YTPlayerCtorOptions) => YTPlayer
}
type YTWindow = Window &
  typeof globalThis & {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }

// YT.PlayerState codes (the API publishes these on YT.PlayerState; we only need
// the numbers, which are stable).
const PLAYING = 1
const ENDED = 0
// Buffering means the player is trying to play, not paused — treat it as such
// so a mid-playback stall doesn't read as "paused" (which would flash the
// poster cover).
const BUFFERING = 3

// The captions module is undocumented and has been renamed over the years, so
// we probe both names.
const CAPTION_MODULES = ["captions", "cc"] as const

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api"

export type YouTubeProviderOptions = {
  // A YouTube video id, or any watch / youtu.be / embed / shorts URL —
  // parseYouTubeId resolves it.
  videoId: string
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}

// Pull the 11-char video id out of any common YouTube URL form; a bare id is
// returned unchanged, so callers can pass either.
export function parseYouTubeId(input: string): string {
  const trimmed = input.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  const m = trimmed.match(
    /(?:youtu\.be\/|\/embed\/|\/shorts\/|[?&]v=)([\w-]{11})/,
  )
  return m ? m[1]! : trimmed
}

// Lazily load the IFrame API exactly once and resolve when YT.Player is ready.
// Multiple players share this single promise; an already-present YT short-
// circuits. The API calls window.onYouTubeIframeAPIReady when it finishes, so
// we chain any existing handler rather than clobber it.
let apiPromise: Promise<YTNamespace> | null = null
function loadYouTubeAPI(): Promise<YTNamespace> {
  const w = window as YTWindow
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (w.YT) resolve(w.YT)
    }
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script")
      script.src = IFRAME_API_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
  return apiPromise
}

function readyYT(): YTNamespace | null {
  if (typeof window === "undefined") return null
  const yt = (window as YTWindow).YT
  return yt && typeof yt.Player === "function" ? yt : null
}

export function createYouTubeProvider(opts: YouTubeProviderOptions): Provider {
  const initialId = parseYouTubeId(opts.videoId)
  let player: YTPlayer | null = null
  let destroyed = false
  // The IFrame API attaches the player's methods only after onReady fires;
  // touching it before then throws. Gate all reads on this flag.
  let ready = false
  let ticker: ReturnType<typeof setInterval> | undefined
  // The rate the viewer chose. Loading a new video resets the player's rate to
  // 1x, so we re-assert this after every load (see syncFromPlayer) and always
  // report it as state.rate so the reset never surfaces.
  let desiredRate = opts.defaultRate ?? 1
  // Which captions-module name this player answers to, and a signature of the
  // last-published track list so we only patch when it actually changes (the
  // ticker reads the list every 250ms).
  let captionModule: string = CAPTION_MODULES[0]
  let captionsSig = ""

  let state: MediaState = {
    ...defaultState(),
    rate: desiredRate,
    muted: opts.muted ?? false,
    capabilities: {
      // The IFrame API no longer exposes manual quality selection.
      canSetQuality: false,
      hasStoryboard: false,
      // No PiP handle on a cross-origin iframe.
      canPiP: false,
      // We fullscreen the kino wrapper (the iframe lives inside it).
      canFullscreen: true,
      canSetRate: true,
      // Caption control over the iframe API is unofficial; keep it off.
      hasTextTracks: false,
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

  const syncFromPlayer = () => {
    if (!player || !ready) return
    // A video load resets the player's rate to 1x; re-assert the chosen rate so
    // it survives loads/swaps.
    if (player.getPlaybackRate() !== desiredRate)
      player.setPlaybackRate(desiredRate)
    const ps = player.getPlayerState()
    const duration = player.getDuration() || 0
    const loaded = player.getVideoLoadedFraction() || 0
    patch({
      paused: ps !== PLAYING && ps !== BUFFERING,
      ended: ps === ENDED,
      currentTime: player.getCurrentTime() || 0,
      duration,
      buffered: duration > 0 ? [[0, loaded * duration]] : [],
      rate: desiredRate,
      volume: (player.getVolume() || 0) / 100,
      muted: player.isMuted(),
      readyState: 4,
    })
    syncCaptions()
  }

  // Read YouTube's caption track list (it populates a beat or two after the
  // module loads) and publish it as text tracks. YouTube renders the cues
  // itself inside the iframe, so kino only owns the on/off + language menu —
  // activeCueText stays empty and the styled overlay paints nothing.
  const syncCaptions = () => {
    if (!player) return
    let list: YTCaptionTrack[] = []
    for (const mod of CAPTION_MODULES) {
      try {
        const got = player.getOption(mod, "tracklist")
        if (Array.isArray(got)) {
          list = got as YTCaptionTrack[]
          captionModule = mod
          if (got.length) break
        }
      } catch {
        /* module not loaded yet */
      }
    }
    const tracks: TextTrackInfo[] = list.map((t) => ({
      id: t.languageCode,
      kind: "captions",
      label: t.displayName || t.languageCode,
      lang: t.languageCode,
      mode: state.activeTextTrackId === t.languageCode ? "showing" : "disabled",
    }))
    const sig = tracks.map((t) => `${t.id}:${t.mode}`).join("|")
    if (sig === captionsSig) return
    captionsSig = sig
    patch({
      textTracks: tracks,
      capabilities: {
        ...state.capabilities,
        hasTextTracks: tracks.length > 0,
      },
    })
  }

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

  const startTicker = () => {
    // The IFrame API fires no timeupdate, so poll while a player exists to keep
    // currentTime / buffered fresh during playback.
    if (ticker == null) ticker = setInterval(syncFromPlayer, 250)
  }

  const actions: PlayerActions = {
    play: () => player?.playVideo(),
    pause: () => player?.pauseVideo(),
    seek: (t) => player?.seekTo(t, true),
    setRate: (r) => {
      desiredRate = r
      player?.setPlaybackRate(r)
      // Reflect immediately even before the player echoes the change.
      patch({ rate: r })
    },
    setVolume: (v) => player?.setVolume(Math.min(100, Math.max(0, v * 100))),
    setMuted: (m) => {
      if (m) player?.mute()
      else player?.unMute()
      patch({ muted: m })
    },
    // The IFrame API exposes no rendition ladder; quality is always "auto".
    setQuality: () => {},
    setTextTrack: (id) => {
      patch({ activeTextTrackId: id })
      // Drive YouTube's native caption rendering: a language code shows that
      // track, an empty value clears it. (The cues paint inside the iframe.)
      try {
        player?.setOption(
          captionModule,
          "track",
          id == null ? {} : { languageCode: id },
        )
      } catch {
        /* module not loaded yet */
      }
      syncCaptions()
    },
    enterFullscreen: (wrapper) => {
      // Fullscreen the kino wrapper so our controls stay over the iframe.
      if (wrapper.requestFullscreen) void wrapper.requestFullscreen()
    },
    exitFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.()
    },
    enterPiP: () => {},
    exitPiP: () => {},
  }

  const createPlayer = (yt: YTNamespace, host: HTMLElement) => {
    player = new yt.Player(host, {
      videoId: initialId,
      playerVars: {
        controls: 0, // kino owns the chrome
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        disablekb: 1, // kino owns the keyboard map
        autoplay: opts.autoPlay ? 1 : 0,
        mute: opts.muted ? 1 : 0,
        loop: opts.loop ? 1 : 0,
        // loop needs an explicit single-video playlist to repeat.
        ...(opts.loop ? { playlist: initialId } : {}),
      },
      events: {
        onReady: (e) => {
          // The event carries the ready player; bind it (onReady can fire before
          // the `new YT.Player()` assignment lands). Methods are live now.
          player = e.target
          ready = true
          player.setPlaybackRate(desiredRate)
          if (opts.muted) player.mute()
          // Ask YouTube to expose its caption tracks (names vary by vintage).
          for (const mod of CAPTION_MODULES) {
            try {
              player.loadModule(mod)
            } catch {
              /* unsupported module name */
            }
          }
          setSessionMetadata(opts.metadata?.videoTitle ?? "Video")
          syncFromPlayer()
          startTicker()
        },
        onStateChange: syncFromPlayer,
        onError: (e) =>
          patch({
            error: { code: e.data ?? 0, message: "YouTube playback error" },
          }),
      },
    })
  }

  return {
    mount(container) {
      // The API replaces the passed element with an <iframe>, so give it a
      // throwaway host div parented in our video host.
      const host = document.createElement("div")
      container.appendChild(host)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      const yt = readyYT()
      if (yt) {
        createPlayer(yt, host)
      } else {
        void loadYouTubeAPI().then((loaded) => {
          // Honor an early teardown: if destroy() ran before the API resolved,
          // don't leave a live player behind.
          if (destroyed) return
          if (host.isConnected) createPlayer(loaded, host)
        })
      }
    },
    swapSource(next: SourceOptions) {
      // YouTube carries the next video id through SourceOptions.src.
      if (!player || !ready || next.src == null) return
      player.loadVideoById(parseYouTubeId(next.src))
      if (next.metadata?.videoTitle != null)
        setSessionMetadata(next.metadata.videoTitle)
      player.setPlaybackRate(desiredRate)
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
      destroyed = true
      ready = false
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      if (ticker != null) clearInterval(ticker)
      ticker = undefined
      try {
        player?.destroy()
      } catch {
        /* already gone */
      }
      player = null
      listeners.clear()
    },
  }
}
