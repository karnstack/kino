import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { parseStoryboard, type Storyboard } from "../util/storyboard"
import { formatTime } from "../util/format-time"

export function Scrubber() {
  const actions = usePlayerActions()
  const duration = useMediaSelector((s) => s.duration)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const buffered = useMediaSelector((s) => s.buffered)
  const storyboardUrl = useMediaSelector((s) => s.storyboard?.vttUrl ?? null)
  const hasStoryboard = useMediaSelector((s) => s.capabilities.hasStoryboard)

  const trackRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const [sb, setSb] = useState<Storyboard | null>(null)

  useEffect(() => {
    if (!hasStoryboard || !storyboardUrl) return
    let alive = true
    fetch(storyboardUrl)
      .then((r) => r.text())
      .then((txt) => {
        if (alive) setSb(parseStoryboard(txt, storyboardUrl))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [hasStoryboard, storyboardUrl])

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  const timeFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    actions.seek(timeFromClientX(e.clientX))
    const move = (ev: PointerEvent) => actions.seek(timeFromClientX(ev.clientX))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ x: e.clientX - rect.left, time: timeFromClientX(e.clientX) })
  }

  const tile = sb && hover ? sb.thumbnailAt(hover.time) : null

  return (
    <div
      className="kino-scrubber"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
    >
      {hover && (
        <div className="kino-preview kino-glass" style={{ left: hover.x }}>
          {tile && (
            <div
              className="kino-preview-img"
              style={{
                width: tile.w,
                height: tile.h,
                backgroundImage: `url(${tile.url})`,
                backgroundPosition: `-${tile.x}px -${tile.y}px`,
              }}
            />
          )}
          <span className="kino-preview-time">{formatTime(hover.time)}</span>
        </div>
      )}
      <div
        ref={trackRef}
        data-testid="kino-track"
        className="kino-track"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration) || 0}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={formatTime(currentTime)}
        onPointerDown={onPointerDown}
      >
        {buffered.map(([s, e], i) => (
          <div
            key={i}
            className="kino-buffered"
            style={{
              left: `${duration > 0 ? (s / duration) * 100 : 0}%`,
              width: `${duration > 0 ? ((e - s) / duration) * 100 : 0}%`,
            }}
          />
        ))}
        <div
          data-testid="kino-progress"
          className="kino-progress"
          style={{ width: `${pct}%` }}
        />
        <div className="kino-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}
