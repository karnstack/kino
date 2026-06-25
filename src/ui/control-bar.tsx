import { useControlsVisible } from "./player"
import { useMediaSelector } from "../core/store"
import { formatTime } from "../util/format-time"
import { Scrubber } from "./scrubber"
import { SpeedMenu, QualityMenu, CaptionsMenu } from "./menus"
import { PlayPauseButton, VolumeControl, PipButton, FullscreenButton } from "./buttons"

export function ControlBar() {
  const visible = useControlsVisible()
  const currentTime = useMediaSelector((s) => s.currentTime)
  const duration = useMediaSelector((s) => s.duration)
  return (
    <div className={`kino-controls kino-glass ${visible ? "is-visible" : ""}`}>
      <Scrubber />
      <div className="kino-controls-row">
        <PlayPauseButton />
        <VolumeControl />
        <span className="kino-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="kino-controls-spacer" />
        <SpeedMenu />
        <QualityMenu />
        <CaptionsMenu />
        <PipButton />
        <FullscreenButton />
      </div>
    </div>
  )
}
