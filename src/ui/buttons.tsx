import type { ChangeEvent } from "react"
import { useMediaSelector, usePlayer } from "../core/store"
import { useWrapperRef } from "./player"
import {
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeMutedIcon,
  PipIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from "./icons"

export function PlayPauseButton() {
  const { actions } = usePlayer()
  const paused = useMediaSelector((s) => s.paused)
  return (
    <button
      type="button"
      className="kino-ctrl"
      aria-label={paused ? "Play" : "Pause"}
      onClick={() => (paused ? actions.play() : actions.pause())}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </button>
  )
}

export function VolumeControl() {
  const { actions } = usePlayer()
  const volume = useMediaSelector((s) => s.volume)
  const muted = useMediaSelector((s) => s.muted)
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    actions.setVolume(v)
    if (muted && v > 0) actions.setMuted(false)
  }
  return (
    <div className="kino-volume">
      <button
        type="button"
        className="kino-ctrl"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={() => actions.setMuted(!muted)}
      >
        {muted ? <VolumeMutedIcon /> : <VolumeIcon />}
      </button>
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
  const { actions } = usePlayer()
  const pip = useMediaSelector((s) => s.pip)
  const canPiP = useMediaSelector((s) => s.capabilities.canPiP)
  if (!canPiP) return null
  return (
    <button
      type="button"
      className="kino-ctrl"
      aria-label={pip ? "Exit picture in picture" : "Picture in picture"}
      onClick={() => (pip ? actions.exitPiP() : actions.enterPiP())}
    >
      <PipIcon />
    </button>
  )
}

export function FullscreenButton() {
  const { actions } = usePlayer()
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
    <button
      type="button"
      className="kino-ctrl"
      aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
      onClick={toggle}
    >
      {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
    </button>
  )
}
