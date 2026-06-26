import { useState } from "react"
import { useControlsVisible, useWrapperRef } from "./player"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { formatTime } from "../util/format-time"
import { Scrubber } from "./scrubber"
import { SettingsSheet } from "./settings-sheet"
import {
  PlayIcon,
  PauseIcon,
  SkipBack5Icon,
  SkipForward5Icon,
  SettingsIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from "./icons"

const SKIP_SECONDS = 5

// Touch-first controls for narrow players (YouTube-style): a 3-button transport
// [back, play/pause, forward] centered over the video, the settings gear in the
// top-right, and the seek bar + fullscreen pinned to the bottom. Speed/captions/
// quality live in the settings sheet so the transport stays uncluttered.
// Visibility is shared with the gesture layer — a tap toggles the whole thing.
export function MobileControls() {
  const visible = useControlsVisible()
  const actions = usePlayerActions()
  const paused = useMediaSelector((s) => s.paused)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const duration = useMediaSelector((s) => s.duration)
  const ended = useMediaSelector((s) => s.ended)
  const fullscreen = useMediaSelector((s) => s.fullscreen)
  const canFullscreen = useMediaSelector((s) => s.capabilities.canFullscreen)
  const wrapperRef = useWrapperRef()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Before playback starts the idle overlay owns the screen (centered play).
  if (paused && currentTime === 0 && !ended) return null

  const back = () => actions.seek(Math.max(0, currentTime - SKIP_SECONDS))
  const forward = () =>
    actions.seek(
      duration
        ? Math.min(duration, currentTime + SKIP_SECONDS)
        : currentTime + SKIP_SECONDS,
    )
  const toggleFullscreen = () => {
    if (fullscreen) actions.exitFullscreen()
    else if (wrapperRef?.current) actions.enterFullscreen(wrapperRef.current)
  }

  return (
    <>
      <div className={`kino-mcontrols ${visible ? "is-visible" : ""}`}>
        <div className="kino-mtop">
          <button
            type="button"
            className="kino-mbtn"
            aria-label="Settings"
            onClick={() => setSheetOpen(true)}
          >
            <SettingsIcon />
          </button>
        </div>

        <div className="kino-mcluster">
          <button
            type="button"
            className="kino-mtransport"
            aria-label={`Back ${SKIP_SECONDS} seconds`}
            onClick={back}
          >
            <SkipBack5Icon />
          </button>
          <button
            type="button"
            className="kino-mctrl-play"
            aria-label={paused ? "Play" : "Pause"}
            onClick={() => (paused ? actions.play() : actions.pause())}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button
            type="button"
            className="kino-mtransport"
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
            onClick={forward}
          >
            <SkipForward5Icon />
          </button>
        </div>

        <div className="kino-mbottom">
          <span className="kino-time kino-mtime">
            {formatTime(currentTime)}
          </span>
          <Scrubber />
          <span className="kino-time kino-mtime kino-time-dur">
            {formatTime(duration)}
          </span>
          {canFullscreen && (
            <button
              type="button"
              className="kino-mbtn"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </button>
          )}
        </div>
      </div>
      <SettingsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
