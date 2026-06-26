import type { ChangeEvent } from "react"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { useWrapperRef } from "./player"
import { Tooltip, SpaceKey, ArrowKey } from "./tooltip"
import {
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeMutedIcon,
  PipIcon,
  FullscreenIcon,
  FullscreenExitIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "./icons"

const SKIP_SECONDS = 5

export function PlayPauseButton() {
  const actions = usePlayerActions()
  const paused = useMediaSelector((s) => s.paused)
  return (
    <Tooltip
      label={paused ? "Play" : "Pause"}
      shortcut={<SpaceKey />}
      align="start"
    >
      <button
        type="button"
        className="kino-ctrl"
        aria-label={paused ? "Play" : "Pause"}
        onClick={() => (paused ? actions.play() : actions.pause())}
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>
    </Tooltip>
  )
}

export function SkipBackButton() {
  const actions = usePlayerActions()
  const currentTime = useMediaSelector((s) => s.currentTime)
  return (
    <Tooltip label="Back" shortcut={<ArrowKey dir="left" />}>
      <button
        type="button"
        className="kino-ctrl kino-ctrl-skip"
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        onClick={() => actions.seek(Math.max(0, currentTime - SKIP_SECONDS))}
      >
        <SkipBackIcon />
        <span className="kino-ctrl-skip-num">{SKIP_SECONDS}</span>
      </button>
    </Tooltip>
  )
}

export function SkipForwardButton() {
  const actions = usePlayerActions()
  const currentTime = useMediaSelector((s) => s.currentTime)
  const duration = useMediaSelector((s) => s.duration)
  return (
    <Tooltip label="Forward" shortcut={<ArrowKey dir="right" />}>
      <button
        type="button"
        className="kino-ctrl kino-ctrl-skip"
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        onClick={() =>
          actions.seek(
            duration
              ? Math.min(duration, currentTime + SKIP_SECONDS)
              : currentTime + SKIP_SECONDS,
          )
        }
      >
        <SkipForwardIcon />
        <span className="kino-ctrl-skip-num">{SKIP_SECONDS}</span>
      </button>
    </Tooltip>
  )
}

export function VolumeControl() {
  const actions = usePlayerActions()
  const volume = useMediaSelector((s) => s.volume)
  const muted = useMediaSelector((s) => s.muted)
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    actions.setVolume(v)
    if (muted && v > 0) actions.setMuted(false)
  }
  return (
    <div className="kino-volume">
      <Tooltip label={muted ? "Unmute" : "Mute"} shortcut="M">
        <button
          type="button"
          className="kino-ctrl"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => actions.setMuted(!muted)}
        >
          {muted ? <VolumeMutedIcon /> : <VolumeIcon />}
        </button>
      </Tooltip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        aria-label="Volume"
        value={muted ? 0 : volume}
        onChange={onChange}
      />
    </div>
  )
}

export function PipButton() {
  const actions = usePlayerActions()
  const pip = useMediaSelector((s) => s.pip)
  const canPiP = useMediaSelector((s) => s.capabilities.canPiP)
  if (!canPiP) return null
  return (
    <Tooltip
      label={pip ? "Exit picture in picture" : "Picture in picture"}
      align="end"
    >
      <button
        type="button"
        className="kino-ctrl"
        aria-label={pip ? "Exit picture in picture" : "Picture in picture"}
        onClick={() => (pip ? actions.exitPiP() : actions.enterPiP())}
      >
        <PipIcon />
      </button>
    </Tooltip>
  )
}

export function FullscreenButton() {
  const actions = usePlayerActions()
  const wrapperRef = useWrapperRef()
  const fullscreen = useMediaSelector((s) => s.fullscreen)
  const canFullscreen = useMediaSelector((s) => s.capabilities.canFullscreen)
  if (!canFullscreen) return null
  const toggle = () => {
    if (fullscreen) {
      actions.exitFullscreen()
      return
    }
    const wrapper = wrapperRef?.current
    if (wrapper) actions.enterFullscreen(wrapper)
  }
  return (
    <Tooltip
      label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      shortcut="F"
      align="end"
    >
      <button
        type="button"
        className="kino-ctrl"
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={toggle}
      >
        {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
      </button>
    </Tooltip>
  )
}
