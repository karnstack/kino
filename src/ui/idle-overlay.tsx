import { useMediaSelector, usePlayerActions } from "../core/store"
import { PlayIcon } from "./icons"

const SPEEDS: Array<{ label: string; rate: number }> = [
  { label: "0.8x", rate: 0.8 },
  { label: "1x", rate: 1 },
  { label: "1.2x", rate: 1.2 },
  { label: "1.5x", rate: 1.5 },
  { label: "1.7x", rate: 1.7 },
  { label: "2x", rate: 2 },
  { label: "Max", rate: 2.5 },
]

export function IdleOverlay() {
  const actions = usePlayerActions()
  const paused = useMediaSelector((s) => s.paused)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const ended = useMediaSelector((s) => s.ended)
  if (!paused || currentTime > 0 || ended) return null

  const startAt = (rate: number) => {
    actions.setRate(rate)
    actions.play()
  }

  return (
    <div className="kino-idle">
      <button
        type="button"
        className="kino-idle-play"
        aria-label="Play"
        onClick={() => actions.play()}
      >
        <PlayIcon />
      </button>
      <div className="kino-idle-speeds kino-glass">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="kino-speed-chip"
            onClick={() => startAt(s.rate)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
