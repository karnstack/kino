import { useControlsVisible, useIsCompact } from "./player"
import { useMediaSelector } from "../core/store"
import { formatTime } from "../util/format-time"
import { Scrubber } from "./scrubber"
import { SpeedMenu, QualityMenu, CaptionsMenu } from "./menus"
import { MobileControls } from "./mobile-controls"
import {
  PlayPauseButton,
  VolumeControl,
  PipButton,
  FullscreenButton,
  SkipBackButton,
  SkipForwardButton,
} from "./buttons"

export function ControlBar() {
  // Narrow players get the touch-first centered cluster + bottom seek bar.
  return useIsCompact() ? <MobileControls /> : <DesktopControls />
}

function DesktopControls() {
  const visible = useControlsVisible()
  const currentTime = useMediaSelector((s) => s.currentTime)
  const duration = useMediaSelector((s) => s.duration)
  const ended = useMediaSelector((s) => s.ended)
  const paused = useMediaSelector((s) => s.paused)
  // At the very start the idle overlay owns the screen (play + speed pill),
  // so keep the bottom bar out of the way until playback has begun.
  if (paused && currentTime === 0 && !ended) return null
  return (
    <div className={`kino-controls ${visible ? "is-visible" : ""}`}>
      <Scrubber />
      <div className="kino-controls-row">
        <div className="kino-controls-group">
          <PlayPauseButton />
          <SkipBackButton />
          <SkipForwardButton />
          <VolumeControl />
        </div>
        <span className="kino-time">
          {formatTime(currentTime)}
          <span className="kino-time-dur"> / {formatTime(duration)}</span>
        </span>
        <div className="kino-controls-group kino-controls-group-end">
          <SpeedMenu />
          <QualityMenu />
          <CaptionsMenu />
          <PipButton />
          <FullscreenButton />
        </div>
      </div>
    </div>
  )
}
