import { Popover } from "./popover"
import { useMediaSelector, usePlayer } from "../core/store"
import { GaugeIcon, SettingsIcon, CcIcon } from "./icons"

const RATES = [0.8, 1, 1.2, 1.5, 1.7, 2, 2.5]

export function SpeedMenu() {
  const { actions } = usePlayer()
  const rate = useMediaSelector((s) => s.rate)
  const canSetRate = useMediaSelector((s) => s.capabilities.canSetRate)
  if (!canSetRate) return null
  const label = rate === 2.5 ? "Max" : `${rate}x`
  return (
    <Popover
      label={`${label} speed`}
      shortcut="S"
      openOn="kino:open-speed"
      trigger={
        <>
          <GaugeIcon />
          <span className="kino-ctrl-label">{label}</span>
        </>
      }
    >
      {RATES.map((r) => (
        <button
          key={r}
          role="menuitemradio"
          aria-checked={r === rate}
          className="kino-menu-item"
          onClick={() => actions.setRate(r)}
        >
          {r === 2.5 ? "Max" : `${r}x`}
        </button>
      ))}
    </Popover>
  )
}

export function QualityMenu() {
  const { actions } = usePlayer()
  const qualities = useMediaSelector((s) => s.qualities)
  const active = useMediaSelector((s) => s.activeQualityId)
  const canSetQuality = useMediaSelector((s) => s.capabilities.canSetQuality)
  if (!canSetQuality || qualities.length === 0) return null
  return (
    <Popover label="Quality" trigger={<SettingsIcon />}>
      <button
        role="menuitemradio"
        aria-checked={active === "auto"}
        className="kino-menu-item"
        onClick={() => actions.setQuality("auto")}
      >
        Auto
      </button>
      {qualities.map((q) => (
        <button
          key={q.id}
          role="menuitemradio"
          aria-checked={active === q.id}
          className="kino-menu-item"
          onClick={() => actions.setQuality(q.id)}
        >
          {q.height}p
        </button>
      ))}
    </Popover>
  )
}

export function CaptionsMenu() {
  const { actions } = usePlayer()
  const tracks = useMediaSelector((s) => s.textTracks)
  const active = useMediaSelector((s) => s.activeTextTrackId)
  const hasTextTracks = useMediaSelector((s) => s.capabilities.hasTextTracks)
  if (!hasTextTracks || tracks.length === 0) return null
  return (
    <Popover label="Captions" shortcut="C" trigger={<CcIcon />}>
      <button
        role="menuitemradio"
        aria-checked={active === null}
        className="kino-menu-item"
        onClick={() => actions.setTextTrack(null)}
      >
        Off
      </button>
      {tracks.map((t) => (
        <button
          key={t.id}
          role="menuitemradio"
          aria-checked={active === t.id}
          className="kino-menu-item"
          onClick={() => actions.setTextTrack(t.id)}
        >
          {t.label || t.lang}
        </button>
      ))}
    </Popover>
  )
}
