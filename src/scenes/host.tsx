import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { sceneAt, localTime } from "./sequence-timeline"
import { TimelineContext, type TimelineContextValue } from "./timeline-context"
import type {
  HostCommand,
  HostEvent,
  HostMediaState,
  SceneManifest,
  SceneManifestScene,
} from "./protocol"

export type SceneModule = { default: ComponentType }

export type SceneHostOptions = {
  container: HTMLElement
  manifest: SceneManifest
  loadScene: (id: string) => Promise<SceneModule>
  // Origin of the embedding page. Targets outgoing posts AND filters
  // incoming commands: messages whose origin does not match are dropped.
  // "*" accepts any parent; lock this down in production hosts.
  parentOrigin?: string
  // The host page bundle wires MotionGlobalConfig.skipAnimations here so
  // scrubbing snaps to settled states. Kino itself stays motion-agnostic.
  onSeekingChange?: (seeking: boolean) => void
}

// Native stage resolution. Scenes are authored against this box and the host
// transform-scales it to the iframe viewport, so output is resolution
// independent.
const STAGE_W = 1920
const STAGE_H = 1080
const STATE_HZ = 10

// How long (sequence-clock seconds) the outgoing scene is held over the
// incoming one on a natural advance. Real Safari flashes when WebKit presents a
// freshly created compositing layer before its content paints (WebKit bug
// 270330); covering the incoming scene's first, possibly unpainted, frame with
// the outgoing scene's settled final frame hides that flash.
const OVERLAP_S = 0.24

export function createSceneHost(opts: SceneHostOptions): { destroy(): void } {
  const { container, manifest, loadScene } = opts
  const parentOrigin = opts.parentOrigin ?? "*"

  // Dev-time sanity: the timeline mapping assumes scenes tile the sequence
  // clock. Warn once at startup, listing every gap or overlap.
  const gaps: string[] = []
  for (let i = 1; i < manifest.scenes.length; i++) {
    const prev = manifest.scenes[i - 1]
    const cur = manifest.scenes[i]
    if (prev && cur && cur.start !== prev.end)
      gaps.push(
        `"${prev.id}" ends at ${prev.end} but "${cur.id}" starts at ${cur.start}`,
      )
  }
  if (gaps.length > 0)
    console.warn(`kino scenes: manifest is not contiguous: ${gaps.join("; ")}`)

  // A video element, not an audio element, for one reason only: Chrome's
  // muted-autoplay exemption covers video elements exclusively, and the muted
  // pip mirror relies on it to start without user activation. The src is
  // audio-only so nothing would render anyway; hiding removes the empty box.
  const audio = document.createElement("video")
  audio.style.display = "none"
  audio.setAttribute("playsinline", "")
  audio.playsInline = true
  audio.setAttribute("src", manifest.audio[0]?.src ?? "")
  audio.preload = "auto"
  container.appendChild(audio)

  // In-flight scene loads can settle after destroy(); once torn down, never
  // reach back out to the parent window.
  let destroyed = false
  const post = (ev: HostEvent) => {
    if (destroyed) return
    window.parent.postMessage(ev, parentOrigin)
  }

  // Global sequence clock, driven by the audio element plus a RAF loop while
  // playing (timeupdate alone is ~250ms, too coarse for motion).
  let time = 0
  const timeListeners = new Set<() => void>()
  const emitTime = () => timeListeners.forEach((l) => l())
  const syncTime = () => {
    time = audio.currentTime
    emitTime()
  }
  let raf = 0
  const rafLoop = () => {
    if (!audio.paused) syncTime()
    raf = requestAnimationFrame(rafLoop)
  }
  raf = requestAnimationFrame(rafLoop)

  const readState = (): HostMediaState => {
    const buffered: Array<[number, number]> = []
    for (let i = 0; i < audio.buffered.length; i++)
      buffered.push([audio.buffered.start(i), audio.buffered.end(i)])
    return {
      currentTime: audio.currentTime,
      duration: manifest.duration,
      paused: audio.paused,
      buffered,
      seeking: audio.seeking,
      ended: audio.ended,
      rate: audio.playbackRate,
      volume: audio.volume,
      muted: audio.muted,
      readyState: audio.readyState,
    }
  }
  const postState = () => post({ type: "kino:state", state: readState() })

  // State ticks: transitions post immediately, a slow interval covers drift
  // while playing (buffered ranges, readyState).
  const interval = setInterval(() => {
    if (!audio.paused) postState()
  }, 1000 / STATE_HZ)

  const AUDIO_EVENTS = [
    "play",
    "pause",
    "seeked",
    "ended",
    "ratechange",
    "volumechange",
    "waiting",
    "canplay",
    "durationchange",
  ]
  const onAudioEvent = () => {
    syncTime()
    postState()
  }
  for (const ev of AUDIO_EVENTS) audio.addEventListener(ev, onAudioEvent)
  audio.addEventListener("timeupdate", syncTime)

  const onSeeked = () => opts.onSeekingChange?.(false)
  audio.addEventListener("seeked", onSeeked)

  const onError = () =>
    post({
      type: "kino:error",
      code: "media",
      message: audio.error?.message ?? "audio failed",
    })
  audio.addEventListener("error", onError)

  const onCommand = (ev: MessageEvent) => {
    // Only the embedding page may drive playback: the message must come from
    // the parent window, and when parentOrigin is locked down, from that
    // origin. Inside a document pip window the host's parent is the pip
    // window itself while commands still originate from the main tab, which
    // is the pip window's opener; opener is on the cross-origin-readable
    // Window property list, and the origin check above still applies.
    if (parentOrigin !== "*" && ev.origin !== parentOrigin) return
    const opener = window.parent.opener as Window | null
    if (ev.source !== window.parent && (opener == null || ev.source !== opener))
      return
    const msg = ev.data as HostCommand
    if (msg == null || typeof msg !== "object") return
    switch (msg.type) {
      case "kino:init":
        audio.playbackRate = msg.rate
        audio.volume = msg.volume
        audio.muted = msg.muted
        if (msg.startTime != null) {
          audio.currentTime = Math.min(
            Math.max(0, msg.startTime),
            manifest.duration,
          )
          syncTime()
          postState()
        }
        // A reloaded pip iframe may lack user activation; a rejected play
        // just leaves the host paused. Promise.resolve guards jsdom stubs
        // that return undefined from play().
        if (msg.autoPlay) void Promise.resolve(audio.play()).catch(() => {})
        break
      case "kino:play":
        void Promise.resolve(audio.play()).catch(() => {})
        break
      case "kino:pause":
        audio.pause()
        break
      case "kino:seek":
        opts.onSeekingChange?.(true)
        audio.currentTime = msg.time
        syncTime()
        postState()
        break
      case "kino:setRate":
        audio.playbackRate = msg.rate
        break
      case "kino:setVolume":
        audio.volume = msg.volume
        break
      case "kino:setMuted":
        audio.muted = msg.muted
        break
    }
  }
  window.addEventListener("message", onCommand)

  // React tree: stage scaling + active scene by time range. Modules are
  // cached after first load; the next scene preloads while the current plays.
  // Failures are memoized too: Stage calls ensureLoaded on every clock tick,
  // so without this a broken scene would retry and re-post at frame rate.
  const moduleCache = new Map<string, ComponentType>()
  const pending = new Set<string>()
  const failed = new Set<string>()
  const ensureLoaded = (id: string, onDone?: () => void) => {
    if (moduleCache.has(id) || pending.has(id) || failed.has(id)) return
    pending.add(id)
    loadScene(id)
      .then((m) => {
        moduleCache.set(id, m.default)
        onDone?.()
      })
      .catch(() => {
        failed.add(id)
        post({
          type: "kino:error",
          code: "scene",
          message: `scene ${id} failed to load`,
        })
      })
      .finally(() => pending.delete(id))
  }

  function Stage() {
    const [, bump] = useState(0)
    const [scale, setScale] = useState(1)
    // The scene rendered last tick, and the outgoing scene currently held over
    // the incoming one. Refs, not state: the external clock already re-renders
    // Stage every tick, so these are read fresh each render without scheduling
    // extra work.
    const prevSceneRef = useRef<SceneManifestScene | null>(null)
    const overlayRef = useRef<{
      scene: SceneManifestScene
      until: number
    } | null>(null)
    // Subscribe this component to the clock so scene swaps re-render.
    useEffect(() => {
      const l = () => bump((n) => n + 1)
      timeListeners.add(l)
      return () => {
        timeListeners.delete(l)
      }
    }, [])
    useEffect(() => {
      const el = container
      const measure = () =>
        setScale(
          Math.min(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H) || 1,
        )
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    const scene = sceneAt(manifest.scenes, time)
    if (!scene) return null
    ensureLoaded(scene.id, () => bump((n) => n + 1))
    const idx = manifest.scenes.indexOf(scene)
    const next = manifest.scenes[idx + 1]
    if (next) ensureLoaded(next.id)

    // Open an overlap window on a natural advance: the clock crossed the shared
    // boundary of two adjacent scenes while playing. A far seek that lands just
    // past a boundary (delta > 0.5) or a scrub must not ghost the old scene, so
    // both are excluded.
    const prev = prevSceneRef.current
    if (prev && prev.id !== scene.id) {
      const natural =
        prev.end === scene.start && time - scene.start <= 0.5 && !audio.seeking
      overlayRef.current = natural
        ? { scene: prev, until: scene.start + OVERLAP_S }
        : null
    }
    prevSceneRef.current = scene

    // Drop the held scene once the window elapses, on a seek back out of or into
    // it (the latter would duplicate the current scene's key), or the instant
    // playback pauses or scrubs. A held overlay left on a paused player would
    // freeze the outgoing scene's frame on screen.
    const overlay = overlayRef.current
    if (
      overlay &&
      (time >= overlay.until ||
        time < overlay.scene.start ||
        overlay.scene.id === scene.id ||
        audio.paused ||
        audio.seeking)
    )
      overlayRef.current = null
    const held = overlayRef.current

    // Current scene first, held scene second so the later sibling paints on top
    // without a z-index. Both slots are a scene-id-keyed wrapper div of the same
    // type under this same parent, so when the outgoing scene moves from the
    // current slot to the held slot React reorders it instead of remounting,
    // preserving its Motion state and its already-fired kino:scenechange effect.
    const layers = held ? [scene, held.scene] : [scene]

    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: STAGE_W,
          height: STAGE_H,
          // translateZ(0) plus willChange and backfaceVisibility pin a
          // persistent compositing layer on this never-unmounting div, so child
          // scene swaps paint into an already-promoted backing store instead of
          // triggering first-show layer creation (the Safari flash). isolate
          // keeps the overlap layers in their own stacking context.
          transform: `translate(-50%, -50%) scale(${scale}) translateZ(0)`,
          overflow: "hidden",
          isolation: "isolate",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
      >
        {layers.map((s) => {
          const Component = moduleCache.get(s.id)
          return Component ? (
            <div key={s.id} style={{ position: "absolute", inset: 0 }}>
              <ActiveScene scene={s} Component={Component} />
            </div>
          ) : null
        })}
      </div>
    )
  }

  function ActiveScene({
    scene,
    Component,
  }: {
    scene: SceneManifestScene
    Component: ComponentType
  }) {
    useEffect(() => {
      post({ type: "kino:scenechange", id: scene.id })
    }, [scene.id])
    // Stable per scene: a fresh context value every clock tick would make
    // every useSyncExternalStore consumer resubscribe at frame rate.
    const value = useMemo<TimelineContextValue>(
      () => ({
        cues: scene.cues,
        duration: scene.cues.audioDuration,
        getTime: () => localTime(scene, time),
        subscribe: (fn) => {
          timeListeners.add(fn)
          return () => {
            timeListeners.delete(fn)
          }
        },
      }),
      [scene],
    )
    return (
      <TimelineContext.Provider value={value}>
        <Component />
      </TimelineContext.Provider>
    )
  }

  const mount = document.createElement("div")
  mount.style.position = "relative"
  mount.style.width = "100%"
  mount.style.height = "100%"
  mount.style.overflow = "hidden"
  container.appendChild(mount)
  const root: Root = createRoot(mount)
  root.render(<Stage />)

  post({ type: "kino:ready", duration: manifest.duration })

  return {
    destroy() {
      destroyed = true
      window.removeEventListener("message", onCommand)
      clearInterval(interval)
      cancelAnimationFrame(raf)
      for (const ev of AUDIO_EVENTS) audio.removeEventListener(ev, onAudioEvent)
      audio.removeEventListener("timeupdate", syncTime)
      audio.removeEventListener("seeked", onSeeked)
      audio.removeEventListener("error", onError)
      audio.pause()
      audio.removeAttribute("src")
      // load() runs the resource selection algorithm and releases the source.
      // jsdom doesn't implement it; swallow that.
      try {
        audio.load()
      } catch {
        /* jsdom / unsupported */
      }
      root.unmount()
      mount.remove()
      audio.remove()
    },
  }
}
