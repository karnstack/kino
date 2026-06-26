import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { CSSProperties, ReactNode, RefObject } from "react"
import {
  PlayerContext,
  useMediaSelector,
  usePlayerActions,
} from "../core/store"
import { resolveKey, isTypingTarget } from "../util/keymap"
import { PlayIcon, PauseIcon } from "./icons"
import type { Provider } from "../core/types"

// Below this player width (px) we swap to the touch-first compact UI: a
// centered control cluster + bottom seek bar + settings sheet. Keyed on the
// player's own width (not the viewport) so small embeds get it too.
const COMPACT_MAX = 560

const WrapperContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null,
)

export function useWrapperRef(): RefObject<HTMLDivElement | null> | null {
  return useContext(WrapperContext)
}

// True when the player is narrow enough to want the compact, touch-oriented
// control layout. Defaults to false outside <Player>.
const CompactContext = createContext(false)
export function useIsCompact(): boolean {
  return useContext(CompactContext)
}

// Shared controls-visibility state. On desktop it's driven by hover/move/focus
// with an auto-hide timer; on compact a tap toggles it (the gesture layer).
type ControlsVisibility = {
  visible: boolean
  show: () => void
  toggle: () => void
}
const ControlsVisibilityContext = createContext<ControlsVisibility | null>(null)

type PlayerProps = {
  provider: Provider
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /**
   * Low-res still (data URI or URL) painted behind the video while the poster
   * and first frame load — a blur-up. The sharp poster covers it once decoded,
   * so it only shows during the initial load and across source swaps.
   */
  placeholder?: string
  children?: ReactNode
}

export function Player({
  provider,
  accentColor,
  theme,
  className,
  placeholder,
  children,
}: PlayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const videoHostRef = useRef<HTMLDivElement | null>(null)
  const hoveredRef = useRef(false)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const host = videoHostRef.current
    if (!host) return
    provider.mount(host)
    return () => provider.destroy()
  }, [provider])

  // Measure the player's own width so embeds (not just phones) get the compact
  // UI. ResizeObserver may be absent under jsdom — guard so tests still mount.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () =>
      setCompact(el.clientWidth > 0 && el.clientWidth <= COMPACT_MAX)
    update()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Track hover so keyboard shortcuts only fire for the player the pointer is
  // over (or that holds focus) — no need to click into it first.
  useEffect(() => {
    const root = wrapperRef.current
    if (!root) return
    const enter = () => (hoveredRef.current = true)
    const leave = () => (hoveredRef.current = false)
    root.addEventListener("pointerenter", enter)
    root.addEventListener("pointerleave", leave)
    return () => {
      root.removeEventListener("pointerenter", enter)
      root.removeEventListener("pointerleave", leave)
    }
  }, [])

  // Keyboard shortcuts on window (not just the focused wrapper) so Space, C, S,
  // etc. work whenever the pointer is over the player or it holds focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const root = wrapperRef.current
      if (!root) return
      const target = e.target as Node | null
      const within = target != null && root.contains(target)
      const active =
        within || hoveredRef.current || root.contains(document.activeElement)
      if (!active) return
      if (isTypingTarget(e.target)) return
      const action = resolveKey(e)
      if (!action) return
      e.preventDefault()
      const s = provider.getState()
      const a = provider.actions
      switch (action.type) {
        case "toggle-play":
          if (s.paused) a.play()
          else a.pause()
          break
        case "seek-by":
          a.seek(Math.max(0, s.currentTime + action.delta))
          break
        case "volume-by":
          a.setVolume(s.volume + action.delta)
          break
        case "toggle-mute":
          a.setMuted(!s.muted)
          break
        case "toggle-fullscreen":
          if (s.fullscreen) a.exitFullscreen()
          else if (wrapperRef.current) a.enterFullscreen(wrapperRef.current)
          break
        case "seek-percent":
          if (s.duration) a.seek((action.percent / 100) * s.duration)
          break
        case "rate-by":
          a.setRate(Math.max(0.25, s.rate + action.delta))
          break
        case "toggle-captions": {
          const next = s.activeTextTrackId
            ? null
            : (s.textTracks[0]?.id ?? null)
          a.setTextTrack(next)
          break
        }
        case "open-speed":
          wrapperRef.current?.dispatchEvent(new Event("kino:open-speed"))
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [provider])

  const style: Record<string, string> = { ...theme }
  if (accentColor) style["--kino-accent"] = accentColor

  return (
    <PlayerContext.Provider value={provider}>
      <WrapperContext.Provider value={wrapperRef}>
        <div
          ref={wrapperRef}
          className={["kino", className].filter(Boolean).join(" ")}
          style={style as CSSProperties}
          tabIndex={0}
        >
          {placeholder && (
            <img
              className="kino-placeholder"
              src={placeholder}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          )}
          <div ref={videoHostRef} className="kino-video-host" />
          <PlayerChrome compact={compact}>{children}</PlayerChrome>
        </div>
      </WrapperContext.Provider>
    </PlayerContext.Provider>
  )
}

// Lives inside the provider so it can read media state. Owns the shared
// controls-visibility state and the gesture layer, and exposes `compact` to
// the controls so they can switch layouts.
function PlayerChrome({
  compact,
  children,
}: {
  compact: boolean
  children?: ReactNode
}) {
  const paused = useMediaSelector((s) => s.paused)
  const wrapperRef = useWrapperRef()
  const visibility = useVisibilityManager(wrapperRef, compact, paused)
  return (
    <CompactContext.Provider value={compact}>
      <ControlsVisibilityContext.Provider value={visibility}>
        <GestureLayer compact={compact} onToggleControls={visibility.toggle} />
        {children}
      </ControlsVisibilityContext.Provider>
    </CompactContext.Provider>
  )
}

function useVisibilityManager(
  wrapperRef: RefObject<HTMLDivElement | null> | null,
  compact: boolean,
  paused: boolean,
): ControlsVisibility {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Read paused inside callbacks/effects without re-subscribing each tick.
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const arm = useCallback(() => {
    clearTimeout(timerRef.current)
    if (!pausedRef.current) {
      timerRef.current = setTimeout(
        () => setVisible(false),
        compact ? 3200 : 2500,
      )
    }
  }, [compact])

  const show = useCallback(() => {
    setVisible(true)
    arm()
  }, [arm])

  const toggle = useCallback(() => {
    if (visible) {
      clearTimeout(timerRef.current)
      setVisible(false)
    } else {
      setVisible(true)
      arm()
    }
  }, [visible, arm])

  // Desktop: hover/move/focus reveal the bar and re-arm the auto-hide. Compact
  // skips this and relies on taps (handled by the gesture layer).
  useEffect(() => {
    const root = wrapperRef?.current
    if (!root || compact) return
    const onShow = () => show()
    const onHide = () => {
      clearTimeout(timerRef.current)
      if (!pausedRef.current) setVisible(false)
    }
    root.addEventListener("pointermove", onShow)
    root.addEventListener("pointerenter", onShow)
    root.addEventListener("pointerleave", onHide)
    root.addEventListener("focusin", onShow)
    show()
    return () => {
      clearTimeout(timerRef.current)
      root.removeEventListener("pointermove", onShow)
      root.removeEventListener("pointerenter", onShow)
      root.removeEventListener("pointerleave", onHide)
      root.removeEventListener("focusin", onShow)
    }
  }, [wrapperRef, compact, show])

  // On compact, when playback (re)starts, arm the auto-hide so the cluster
  // doesn't linger after the user hits the center play button.
  useEffect(() => {
    if (compact && !paused) arm()
  }, [compact, paused, arm])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // While paused the controls always stay up (nothing to hide behind).
  return { visible: visible || paused, show, toggle }
}

// Full-bleed layer over the video. On desktop a click toggles play/pause and a
// double-click toggles fullscreen, with a center icon pulsing on every toggle.
// On compact a tap just reveals/dismisses the controls (the center button owns
// play/pause). Sits beneath the controls in the DOM so buttons keep their own
// clicks.
function GestureLayer({
  compact,
  onToggleControls,
}: {
  compact: boolean
  onToggleControls: () => void
}) {
  const actions = usePlayerActions()
  const paused = useMediaSelector((s) => s.paused)
  const fullscreen = useMediaSelector((s) => s.fullscreen)
  const wrapperRef = useWrapperRef()
  // Defer the play/pause toggle briefly so a double-click (fullscreen) can
  // cancel it — otherwise the two clicks of a dbl-click also flip playback.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  useEffect(() => () => clearTimeout(clickTimer.current), [])

  if (compact) {
    return (
      <div className="kino-gesture" onClick={onToggleControls}>
        <CenterFlash />
      </div>
    )
  }

  const togglePlay = () => (paused ? actions.play() : actions.pause())
  const toggleFullscreen = () => {
    if (fullscreen) actions.exitFullscreen()
    else if (wrapperRef?.current) actions.enterFullscreen(wrapperRef.current)
  }
  return (
    <div
      className="kino-gesture"
      onClick={() => {
        clearTimeout(clickTimer.current)
        clickTimer.current = setTimeout(togglePlay, 220)
      }}
      onDoubleClick={() => {
        clearTimeout(clickTimer.current)
        toggleFullscreen()
      }}
    >
      <CenterFlash />
    </div>
  )
}

function CenterFlash() {
  const paused = useMediaSelector((s) => s.paused)
  const [pulse, setPulse] = useState<{ id: number; paused: boolean } | null>(
    null,
  )
  const firstRun = useRef(true)
  const seq = useRef(0)
  useEffect(() => {
    // Skip the initial mount so a flash only plays on real play/pause toggles.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    seq.current += 1
    setPulse({ id: seq.current, paused })
  }, [paused])
  if (!pulse) return null
  return (
    <div key={pulse.id} className="kino-flash" aria-hidden="true">
      {pulse.paused ? <PauseIcon /> : <PlayIcon />}
    </div>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="kino-overlay">{children}</div>
}
Player.Overlay = Overlay

export function useControlsVisible(): boolean {
  return useContext(ControlsVisibilityContext)?.visible ?? true
}
