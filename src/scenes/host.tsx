import { useEffect, useState, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import { sceneAt, localTime } from "./lesson-timeline"
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
  // Origin of the embedding page for postMessage targeting/filtering.
  // "*" accepts any parent; lock this down in production hosts.
  parentOrigin?: string
  // The lesson bundle wires MotionGlobalConfig.skipAnimations here so
  // scrubbing snaps to settled states. Kino itself stays motion-agnostic.
  onSeekingChange?: (seeking: boolean) => void
}

// Native stage resolution. Scenes are authored against this box and the host
// transform-scales it to the iframe viewport, so output is resolution
// independent.
const STAGE_W = 1920
const STAGE_H = 1080
const STATE_HZ = 10

export function createSceneHost(opts: SceneHostOptions): { destroy(): void } {
  const { container, manifest, loadScene } = opts
  const parentOrigin = opts.parentOrigin ?? "*"

  const audio = document.createElement("audio")
  audio.setAttribute("src", manifest.audio[0]?.src ?? "")
  audio.preload = "auto"
  container.appendChild(audio)

  const post = (ev: HostEvent) => {
    window.parent.postMessage(ev, parentOrigin)
  }

  // Global lesson clock, driven by the audio element plus a RAF loop while
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
    // Only the embedding page may drive playback.
    if (ev.source !== window.parent) return
    const msg = ev.data as HostCommand
    if (msg == null || typeof msg !== "object") return
    switch (msg.type) {
      case "kino:init":
        audio.playbackRate = msg.rate
        audio.volume = msg.volume
        audio.muted = msg.muted
        if (msg.autoPlay) void audio.play()
        break
      case "kino:play":
        void audio.play()
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
  const moduleCache = new Map<string, ComponentType>()
  const pending = new Set<string>()
  const ensureLoaded = (id: string, onDone?: () => void) => {
    if (moduleCache.has(id) || pending.has(id)) return
    pending.add(id)
    loadScene(id)
      .then((m) => {
        moduleCache.set(id, m.default)
        onDone?.()
      })
      .catch(() =>
        post({
          type: "kino:error",
          code: "scene",
          message: `scene ${id} failed to load`,
        }),
      )
      .finally(() => pending.delete(id))
  }

  function Stage() {
    const [, bump] = useState(0)
    const [scale, setScale] = useState(1)
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
    const Component = moduleCache.get(scene.id)

    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          overflow: "hidden",
        }}
      >
        {Component ? (
          <ActiveScene key={scene.id} scene={scene} Component={Component} />
        ) : null}
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
    const value: TimelineContextValue = {
      cues: scene.cues,
      duration: scene.cues.audioDuration,
      getTime: () => localTime(scene, time),
      subscribe: (fn) => {
        timeListeners.add(fn)
        return () => {
          timeListeners.delete(fn)
        }
      },
    }
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
      window.removeEventListener("message", onCommand)
      clearInterval(interval)
      cancelAnimationFrame(raf)
      for (const ev of AUDIO_EVENTS) audio.removeEventListener(ev, onAudioEvent)
      audio.removeEventListener("timeupdate", syncTime)
      audio.removeEventListener("seeked", onSeeked)
      audio.removeEventListener("error", onError)
      audio.pause()
      audio.removeAttribute("src")
      root.unmount()
      mount.remove()
      audio.remove()
    },
  }
}
