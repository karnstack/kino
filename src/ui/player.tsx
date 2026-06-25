import { createContext, useContext, useEffect, useRef, useState } from "react"
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react"
import { PlayerContext, useMediaSelector } from "../core/store"
import { resolveKey, isTypingTarget } from "../util/keymap"
import type { Provider } from "../core/types"

const WrapperContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null
)

export function useWrapperRef(): RefObject<HTMLDivElement | null> | null {
  return useContext(WrapperContext)
}

type PlayerProps = {
  provider: Provider
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  children?: ReactNode
}

export function Player({
  provider,
  accentColor,
  theme,
  className,
  children,
}: PlayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const videoHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = videoHostRef.current
    if (!host) return
    provider.mount(host)
    return () => provider.destroy()
  }, [provider])

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(e.target)) return
    const action = resolveKey(e.nativeEvent)
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
        const next = s.activeTextTrackId ? null : (s.textTracks[0]?.id ?? null)
        a.setTextTrack(next)
        break
      }
      case "open-speed":
        wrapperRef.current?.dispatchEvent(new Event("kino:open-speed"))
        break
    }
  }

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
          onKeyDown={handleKeyDown}
        >
          <div ref={videoHostRef} className="kino-video-host" />
          {children}
        </div>
      </WrapperContext.Provider>
    </PlayerContext.Provider>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="kino-overlay">{children}</div>
}
Player.Overlay = Overlay

export function useControlsVisible(): boolean {
  const [visible, setVisible] = useState(true)
  const wrapperRef = useWrapperRef()
  const paused = useMediaSelector((s) => s.paused)
  useEffect(() => {
    const root = wrapperRef?.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      setVisible(true)
      clearTimeout(timer)
      if (!paused) timer = setTimeout(() => setVisible(false), 2500)
    }
    root.addEventListener("pointermove", show)
    root.addEventListener("focusin", show)
    show()
    return () => {
      clearTimeout(timer)
      root.removeEventListener("pointermove", show)
      root.removeEventListener("focusin", show)
    }
  }, [wrapperRef, paused])
  return visible || paused
}
