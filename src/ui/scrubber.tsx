import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { parseStoryboard, type Storyboard } from "../util/storyboard"
import { formatTime } from "../util/format-time"
import { RollingTime } from "./rolling-time"
import { useMarkers, visibleMarkers } from "./markers"
import type { Marker } from "../core/types"

export function Scrubber() {
  const actions = usePlayerActions()
  const duration = useMediaSelector((s) => s.duration)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const buffered = useMediaSelector((s) => s.buffered)
  const storyboardUrl = useMediaSelector((s) => s.storyboard?.vttUrl ?? null)
  const hasStoryboard = useMediaSelector((s) => s.capabilities.hasStoryboard)
  const { markers, onMarkerClick } = useMarkers()
  const shown = visibleMarkers(markers, duration)
  const [hoverMarker, setHoverMarker] = useState<Marker | null>(null)

  const trackRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  // Cleanup for an in-flight drag, so window listeners don't outlive the
  // component if it unmounts mid-drag (e.g. layout swaps compact <-> desktop).
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanup.current?.(), [])
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const [sb, setSb] = useState<Storyboard | null>(null)
  // measured (post-transform) preview width + track width, to keep the preview
  // from spilling past either edge of the player
  const [dims, setDims] = useState<{ pw: number; tw: number }>({ pw: 0, tw: 0 })

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
      window.removeEventListener("pointercancel", up)
      dragCleanup.current = null
    }
    dragCleanup.current = up
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ x: e.clientX - rect.left, time: timeFromClientX(e.clientX) })
  }

  const tile = sb && hover ? sb.thumbnailAt(hover.time) : null

  useLayoutEffect(() => {
    const pw = previewRef.current?.getBoundingClientRect().width ?? 0
    const tw = trackRef.current?.getBoundingClientRect().width ?? 0
    setDims({ pw, tw })
  }, [hover, tile?.url])

  // Center the preview on the cursor, but clamp so it never crosses an edge.
  let previewLeft = hover?.x ?? 0
  if (hover && dims.pw > 0 && dims.tw > 0) {
    const half = dims.pw / 2 + 4
    previewLeft = Math.min(Math.max(hover.x, half), dims.tw - half)
  }

  return (
    <div
      className="kino-scrubber"
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        setHover(null)
        setHoverMarker(null)
      }}
      onPointerDown={onPointerDown}
    >
      {hover && (
        <div
          ref={previewRef}
          className="kino-preview kino-glass"
          style={{ left: previewLeft }}
        >
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
          <span className="kino-preview-time">
            <RollingTime value={formatTime(hover.time)} />
          </span>
          {hoverMarker?.label && (
            <span className="kino-preview-label">{hoverMarker.label}</span>
          )}
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
      {shown.length > 0 && (
        <div className="kino-markers">
          {shown.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid="kino-marker"
              className={
                m.icon ? "kino-marker kino-marker-icon" : "kino-marker"
              }
              aria-label={m.label ?? `Marker at ${formatTime(m.time)}`}
              style={
                {
                  left: `${(m.time / duration) * 100}%`,
                  ...(m.color ? { "--kino-marker-color": m.color } : {}),
                } as CSSProperties
              }
              // The scrubber seeks on pointerdown; a marker is a button, not a seek.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onMarkerClick?.(m.id)
              }}
              onPointerEnter={() => setHoverMarker(m)}
              onPointerLeave={() => setHoverMarker(null)}
            >
              {m.icon && <span aria-hidden="true">{m.icon}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
