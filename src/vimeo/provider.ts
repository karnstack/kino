import { defaultState } from "../core/fake-provider"
import type { MediaState, PlayerActions, Provider, QualityLevel, TextTrackInfo, SourceOptions } from "../core/types"

export type VimeoProviderOptions = {
  // A numeric Vimeo id, or any vimeo.com / player.vimeo.com URL —
  // parseVimeoSource resolves it.
  videoId: string
  // Unlisted/private hash. Also parsed from the URL form; an explicit hash here
  // wins over a URL-derived one.
  hash?: string
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}

// Pull the numeric id (and optional unlisted hash) out of any common Vimeo
// reference. A bare id is returned unchanged so callers can pass either.
//   vimeo.com/123                -> { id: "123" }
//   vimeo.com/123/HASH           -> { id: "123", hash: "HASH" }
//   player.vimeo.com/video/123?h=HASH -> { id: "123", hash: "HASH" }
export function parseVimeoSource(input: string): { id: string; hash?: string } {
  const trimmed = input.trim()
  // ?h= query form (player.vimeo.com embeds).
  const q = trimmed.match(/[?&]h=([\w]+)/)
  // /ID or /ID/HASH path form (vimeo.com share links). The id is the first
  // numeric path segment; the hash is the next path segment if present.
  const path = trimmed.match(/(?:^|\/)(\d+)(?:\/([\w]+))?/)
  if (!path) return { id: trimmed }
  const id = path[1]!
  const hash = q?.[1] ?? path[2]
  return hash ? { id, hash } : { id }
}

// The documented SDK embed URL that carries an unlisted hash.
export function playerUrl(id: string, hash: string): string {
  return `https://player.vimeo.com/video/${id}?h=${hash}`
}

// Narrow structural view of the Vimeo Player SDK surface we touch. Hand-rolled
// (like youtube's YTPlayer) so the provider needs no runtime dep or typings.
type VimeoEventHandler = (data?: unknown) => void
export type VimeoPlayer = {
  on(event: string, handler: VimeoEventHandler): void
  off(event: string, handler?: VimeoEventHandler): void
  ready(): Promise<void>
  play(): Promise<unknown>
  pause(): Promise<unknown>
  setCurrentTime(seconds: number): Promise<number>
  getDuration(): Promise<number>
  getVolume(): Promise<number>
  setVolume(volume: number): Promise<number>
  getMuted(): Promise<boolean>
  setMuted(muted: boolean): Promise<boolean>
  setPlaybackRate(rate: number): Promise<number>
  getQualities(): Promise<Array<{ id: string; label: string; active: boolean }>>
  setQuality(id: string): Promise<string>
  getTextTracks(): Promise<
    Array<{ label: string; language: string; kind: string; mode: string }>
  >
  enableTextTrack(
    language: string,
    kind?: string,
    showing?: boolean,
  ): Promise<unknown>
  disableTextTrack(): Promise<unknown>
  requestPictureInPicture(): Promise<unknown>
  exitPictureInPicture(): Promise<unknown>
  loadVideo(idOrOpts: number | string | { id?: number | string; url?: string }): Promise<unknown>
  destroy(): Promise<unknown>
}
type VimeoNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => VimeoPlayer
}
type VimeoWindow = Window & typeof globalThis & { Vimeo?: VimeoNamespace }

const SDK_SRC = "https://player.vimeo.com/api/player.js"

// Lazily load player.js exactly once; resolve when window.Vimeo.Player exists.
// There is no global ready callback (unlike YouTube), so we resolve on the
// script's load event. An already-present window.Vimeo short-circuits.
let apiPromise: Promise<VimeoNamespace> | null = null
function loadVimeoAPI(): Promise<VimeoNamespace> {
  const w = window as VimeoWindow
  if (w.Vimeo?.Player) return Promise.resolve(w.Vimeo)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<VimeoNamespace>((resolve, reject) => {
    const finish = () => {
      if (w.Vimeo?.Player) resolve(w.Vimeo)
      else reject(new Error("Vimeo SDK loaded but window.Vimeo is missing"))
    }
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
    if (existing) {
      existing.addEventListener("load", finish)
      return
    }
    const script = document.createElement("script")
    script.src = SDK_SRC
    script.async = true
    script.addEventListener("load", finish)
    document.head.appendChild(script)
  })
  return apiPromise
}

function readyVimeo(): VimeoNamespace | null {
  if (typeof window === "undefined") return null
  const v = (window as VimeoWindow).Vimeo
  return v && typeof v.Player === "function" ? v : null
}

function mapQualities(
  raw: Array<{ id: string; label: string; active: boolean }>,
): { qualities: QualityLevel[]; activeId: string } {
  const qualities = raw
    // Drop Vimeo's "auto" pseudo-quality: kino renders its own Auto row, and
    // parseInt("auto") would surface a bogus "0p" rendition that also matches
    // activeQualityId === "auto", double-checking the menu.
    .filter((q) => parseInt(q.id, 10) > 0)
    .map((q) => ({
      id: q.id,
      height: parseInt(q.id, 10), // id is "2160p"; label "4K" would parse to 4
      bitrate: 0, // Vimeo exposes no bitrate
      selected: q.active,
    }))
  const active = raw.find((q) => q.active)?.id ?? "auto"
  return { qualities, activeId: active }
}

// getTextTracks() objects have no id; synthesize a stable one. Disambiguate
// same-language/same-kind duplicates with an index suffix.
function mapTracks(
  raw: Array<{ label: string; language: string; kind: string; mode: string }>,
): TextTrackInfo[] {
  const seen = new Map<string, number>()
  return raw.map((t) => {
    const base = `${t.language}.${t.kind}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = n === 0 ? base : `${base}.${n}`
    return {
      id,
      kind: t.kind,
      label: t.label || t.language,
      lang: t.language,
      mode: t.mode === "showing" ? "showing" : "disabled",
    }
  })
}

export function createVimeoProvider(opts: VimeoProviderOptions): Provider {
  const explicit = parseVimeoSource(opts.videoId)
  const initial = { id: explicit.id, hash: opts.hash ?? explicit.hash }
  let player: VimeoPlayer | null = null
  let destroyed = false
  let desiredRate = opts.defaultRate ?? 1

  let state: MediaState = {
    ...defaultState(),
    rate: desiredRate,
    muted: opts.muted ?? false,
    capabilities: {
      canSetRate: true, // best-effort: setPlaybackRate is plan-gated, can't probe
      hasStoryboard: false,
      canPiP: !!(
        typeof document !== "undefined" && document.pictureInPictureEnabled
      ),
      canFullscreen: true,
      // Flip on at `loaded` once getQualities/getTextTracks return non-empty.
      canSetQuality: false,
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

  const actions: PlayerActions = {
    play: () => void player?.play().catch(() => {}),
    pause: () => void player?.pause().catch(() => {}),
    seek: (t) => {
      patch({ seeking: true })
      void player?.setCurrentTime(t).catch(() => {})
    },
    setRate: (r) => {
      desiredRate = r
      // Patch rate when setPlaybackRate resolves (confirms it took). Vimeo does
      // not emit playbackratechange for a programmatic rate change, so relying
      // on the echo alone leaves the control stuck at the old rate while the
      // video plays at the new one.
      void player
        ?.setPlaybackRate(r)
        .then(() => patch({ rate: r }))
        .catch(() => {})
    },
    setVolume: (v) => void player?.setVolume(v).catch(() => {}),
    setMuted: (m) => void player?.setMuted(m).catch(() => {}),
    setQuality: (id) => void player?.setQuality(id).catch(() => {}),
    setTextTrack: (id) => {
      if (id == null) {
        patch({ activeTextTrackId: null, activeCueText: "" })
        void player?.disableTextTrack().catch(() => {})
        return
      }
      const ref = state.textTracks.find((t) => t.id === id)
      patch({ activeTextTrackId: id })
      if (ref) void player?.enableTextTrack(ref.lang, ref.kind, false).catch(() => {})
    },
    enterFullscreen: (wrapper) => {
      if (wrapper.requestFullscreen) void wrapper.requestFullscreen()
    },
    exitFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen?.()
    },
    enterPiP: () => void player?.requestPictureInPicture().catch(() => {}),
    exitPiP: () => void player?.exitPictureInPicture().catch(() => {}),
  }

  const setSessionMetadata = (title: string) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
    if (typeof MediaMetadata === "undefined") return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title })
    } catch {
      /* ignore */
    }
  }

  const onLoaded = async () => {
    if (!player) return
    const p = player
    const [duration, rawQualities, rawTracks, muted] = await Promise.all([
      p.getDuration().catch(() => 0),
      p.getQualities().catch(() => []),
      p.getTextTracks().catch(() => []),
      p.getMuted().catch(() => false),
    ])
    if (destroyed) return
    void p.setPlaybackRate(desiredRate).catch(() => {})
    const { qualities, activeId } = mapQualities(rawQualities)
    const tracks = mapTracks(rawTracks)
    setSessionMetadata(opts.metadata?.videoTitle ?? "Video")
    patch({
      duration: duration || state.duration,
      readyState: 4,
      muted,
      qualities,
      activeQualityId: activeId,
      textTracks: tracks,
      capabilities: {
        ...state.capabilities,
        canSetQuality: qualities.length > 0,
        hasTextTracks: tracks.length > 0,
      },
    })
  }

  const bindEvents = (p: VimeoPlayer) => {
    p.on("play", () => patch({ paused: false, ended: false }))
    p.on("pause", () => patch({ paused: true }))
    p.on("ended", () => patch({ paused: true, ended: true }))
    p.on("bufferstart", () => { if (!state.seeking) patch({ paused: false }) })
    p.on("bufferend", () => {})
    p.on("timeupdate", (d) => {
      const e = d as { seconds: number; duration: number }
      patch({
        currentTime: e.seconds ?? 0,
        duration: e.duration ?? state.duration,
        seeking: false,
        readyState: 4,
      })
    })
    p.on("progress", (d) => {
      const e = d as { duration: number; percent: number }
      const duration = e.duration ?? state.duration
      patch({ buffered: duration > 0 ? [[0, e.percent * duration]] : [] })
    })
    p.on("seeking", (d) => {
      const e = d as { seconds?: number }
      patch({ seeking: true, currentTime: e?.seconds ?? state.currentTime })
    })
    p.on("seeked", (d) => {
      const e = d as { seconds?: number }
      patch({ seeking: false, ended: false, currentTime: e?.seconds ?? state.currentTime })
    })
    p.on("volumechange", (d) => {
      const e = d as { volume: number; muted?: boolean }
      patch({ volume: e.volume, muted: e.muted ?? state.muted })
    })
    p.on("playbackratechange", (d) => {
      const e = d as { playbackRate: number }
      desiredRate = e.playbackRate
      patch({ rate: e.playbackRate })
    })
    p.on("fullscreenchange", (d) => {
      const e = d as { fullscreen: boolean }
      patch({ fullscreen: !!e.fullscreen })
    })
    p.on("enterpictureinpicture", () => patch({ pip: true }))
    p.on("leavepictureinpicture", () => patch({ pip: false }))
    p.on("error", (d) => {
      const e = d as { name?: string; message?: string }
      const message = e.name ? `${e.name}: ${e.message ?? ""}`.trim() : (e.message ?? "Vimeo playback error")
      patch({ error: { code: 0, message } })
    })
    p.on("loaded", () => void onLoaded())
    p.on("qualitychange", (d) => patch({ activeQualityId: (d as { quality: string }).quality }))
    p.on("cuechange", (d) => {
      const e = d as { cues?: Array<{ text?: string }> }
      patch({ activeCueText: e.cues?.[0]?.text ?? "" })
    })
    p.on("texttrackchange", (d) => {
      const e = d as { language: string | null; kind: string | null }
      if (e.language == null) {
        patch({ activeTextTrackId: null, activeCueText: "" })
        return
      }
      const match = state.textTracks.find(
        (t) => t.lang === e.language && t.kind === e.kind,
      )
      patch({ activeTextTrackId: match?.id ?? state.activeTextTrackId })
    })
  }

  const createPlayer = (v: VimeoNamespace, host: HTMLElement) => {
    const ctorOpts: Record<string, unknown> = {
      controls: false, // kino owns the chrome (paid-plan feature)
      autoplay: !!opts.autoPlay,
      muted: !!opts.muted,
      loop: !!opts.loop,
      playsinline: true,
      dnt: true,
      keyboard: false,
    }
    if (initial.hash) ctorOpts.url = playerUrl(initial.id, initial.hash)
    else ctorOpts.id = initial.id
    const p = new v.Player(host, ctorOpts)
    player = p
    void p.ready().then(() => {
      if (destroyed) return
    })
    bindEvents(p)
  }

  return {
    mount(container) {
      const host = document.createElement("div")
      container.appendChild(host)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      const v = readyVimeo()
      if (v) {
        createPlayer(v, host)
      } else {
        void loadVimeoAPI().then((loaded) => {
          if (destroyed) return
          if (host.isConnected) createPlayer(loaded, host)
        })
      }
    },
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    swapSource(next: SourceOptions) {
      if (!player || next.src == null) return
      const { id, hash } = parseVimeoSource(next.src)
      void player
        .loadVideo(hash ? { url: playerUrl(id, hash) } : Number(id))
        .then(() => void player?.setPlaybackRate(desiredRate).catch(() => {}))
        .catch(() => {})
      if (next.metadata?.videoTitle != null)
        setSessionMetadata(next.metadata.videoTitle)
      patch({
        currentTime: 0,
        duration: 0,
        ended: false,
        seeking: false,
        error: null,
      })
    },
    actions,
    destroy() {
      destroyed = true
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      try {
        void player?.destroy()
      } catch {
        /* already gone */
      }
      player = null
      listeners.clear()
    },
  }
}
