import type { CSSProperties } from "react"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { useIsCompact } from "./player"
import { PlayIcon } from "./icons"

const SPEEDS = [0.8, 1, 1.2, 1.5, 1.7, 2, 2.5]
const MAX_RATE = 2.5

export function IdleOverlay() {
  const actions = usePlayerActions()
  const compact = useIsCompact()
  const paused = useMediaSelector((s) => s.paused)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const ended = useMediaSelector((s) => s.ended)
  const rate = useMediaSelector((s) => s.rate)
  if (!paused || currentTime > 0 || ended) return null

  const startAt = (r: number) => {
    actions.setRate(r)
    actions.play()
  }

  return (
    <div className="kino-idle" onClick={() => actions.play()}>
      <button
        type="button"
        className="kino-idle-play"
        aria-label="Play"
        onClick={() => actions.play()}
      >
        <PlayIcon />
      </button>
      {!compact && (
        <div className="kino-idle-speeds">
          {SPEEDS.map((r, i) => {
            const isMax = r === MAX_RATE
            return (
              <button
                key={r}
                type="button"
                className="kino-speed-chip"
                style={{ "--i": i } as CSSProperties}
                aria-label={isMax ? "Max" : `${r}x`}
                aria-pressed={r === rate}
                data-active={r === rate}
                data-max={isMax}
                onClick={() => startAt(r)}
              >
                {isMax ? (
                  <>
                    <span className="kino-bolt" aria-hidden="true">
                      ⚡
                    </span>
                    Max
                  </>
                ) : (
                  `${r}×`
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
