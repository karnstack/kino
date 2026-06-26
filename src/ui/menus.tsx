import { Popover } from "./popover"
import { useMediaSelector, usePlayerActions } from "../core/store"
import { CcIcon, CcOffIcon } from "./icons"

const RATES = [0.8, 1, 1.2, 1.5, 1.7, 2, 2.5]

const QUALITY_TIERS: Array<[number, string]> = [
  [2160, "4K"],
  [1440, "2K"],
  [1080, "FHD"],
  [720, "HD"],
  [480, "SD"],
]
const heightKeyword = (h: number) => {
  for (const [min, kw] of QUALITY_TIERS) if (h >= min) return kw
  return `${h}p`
}

export function SpeedMenu() {
  const actions = usePlayerActions()
  const rate = useMediaSelector((s) => s.rate)
  const canSetRate = useMediaSelector((s) => s.capabilities.canSetRate)
  if (!canSetRate) return null
  const label = rate === 2.5 ? "Max" : `${rate} ×`
  return (
    <Popover
      label="Speed"
      shortcut="S"
      openOn="kino:open-speed"
      trigger={
        <span className="kino-ctrl-label kino-speed-label">{label}</span>
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
  const actions = usePlayerActions()
  const qualities = useMediaSelector((s) => s.qualities)
  const active = useMediaSelector((s) => s.activeQualityId)
  const videoHeight = useMediaSelector((s) => s.videoHeight)
  const canSetQuality = useMediaSelector((s) => s.capabilities.canSetQuality)
  if (!canSetQuality || qualities.length === 0) return null
  const topHeight = Math.max(...qualities.map((q) => q.height))
  // Badge reflects what's actually playing in auto, or the pinned rendition.
  const badgeHeight =
    active === "auto"
      ? videoHeight || topHeight
      : (qualities.find((q) => q.id === active)?.height ?? topHeight)
  const autoHint = videoHeight ? heightKeyword(videoHeight) : ""
  const sorted = [...qualities].sort((a, b) => b.height - a.height)
  return (
    <Popover
      label="Quality"
      align="end"
      trigger={
        <span className="kino-quality-badge">{heightKeyword(badgeHeight)}</span>
      }
    >
      <button
        role="menuitemradio"
        aria-checked={active === "auto"}
        className="kino-menu-item kino-menu-q"
        onClick={() => actions.setQuality("auto")}
      >
        <span className="kino-q-label">
          <span className="kino-q-key">Auto</span>
          {autoHint && <span className="kino-q-px">({autoHint})</span>}
        </span>
      </button>
      {sorted.map((q) => (
        <button
          key={q.id}
          role="menuitemradio"
          aria-checked={active === q.id}
          className="kino-menu-item kino-menu-q"
          onClick={() => actions.setQuality(q.id)}
        >
          <span className="kino-q-label">
            <span className="kino-q-key">{heightKeyword(q.height)}</span>
            <span className="kino-q-px">{q.height}p</span>
          </span>
        </button>
      ))}
    </Popover>
  )
}

export function CaptionsMenu() {
  const actions = usePlayerActions()
  const tracks = useMediaSelector((s) => s.textTracks)
  const active = useMediaSelector((s) => s.activeTextTrackId)
  const hasTextTracks = useMediaSelector((s) => s.capabilities.hasTextTracks)
  if (!hasTextTracks || tracks.length === 0) return null
  return (
    <Popover
      label="Captions"
      shortcut="C"
      align="end"
      trigger={active ? <CcIcon /> : <CcOffIcon />}
    >
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
