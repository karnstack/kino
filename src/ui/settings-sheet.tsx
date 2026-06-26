import { useMediaSelector, usePlayerActions } from "../core/store"

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

// Bottom sheet for the compact UI: speed, captions and quality as tap targets.
// Slides up over the player; tapping the backdrop dismisses it. PiP is left out
// on mobile — phones surface it through the OS.
export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const actions = usePlayerActions()
  const rate = useMediaSelector((s) => s.rate)
  const canSetRate = useMediaSelector((s) => s.capabilities.canSetRate)
  const tracks = useMediaSelector((s) => s.textTracks)
  const activeTrack = useMediaSelector((s) => s.activeTextTrackId)
  const hasTextTracks = useMediaSelector((s) => s.capabilities.hasTextTracks)
  const qualities = useMediaSelector((s) => s.qualities)
  const activeQuality = useMediaSelector((s) => s.activeQualityId)
  const canSetQuality = useMediaSelector((s) => s.capabilities.canSetQuality)

  const sortedQualities = [...qualities].sort((a, b) => b.height - a.height)

  return (
    <div
      className={`kino-sheet-backdrop ${open ? "is-open" : ""}`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className="kino-sheet kino-glass"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kino-sheet-grip" aria-hidden="true" />

        {canSetRate && (
          <section className="kino-sheet-section">
            <h3 className="kino-sheet-title">Speed</h3>
            <div className="kino-sheet-chips">
              {RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="kino-sheet-chip"
                  data-active={r === rate}
                  aria-pressed={r === rate}
                  onClick={() => actions.setRate(r)}
                >
                  {r === 2.5 ? "Max" : `${r}×`}
                </button>
              ))}
            </div>
          </section>
        )}

        {hasTextTracks && tracks.length > 0 && (
          <section className="kino-sheet-section">
            <h3 className="kino-sheet-title">Captions</h3>
            <div className="kino-sheet-chips">
              <button
                type="button"
                className="kino-sheet-chip"
                data-active={activeTrack === null}
                aria-pressed={activeTrack === null}
                onClick={() => actions.setTextTrack(null)}
              >
                Off
              </button>
              {tracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="kino-sheet-chip"
                  data-active={activeTrack === t.id}
                  aria-pressed={activeTrack === t.id}
                  onClick={() => actions.setTextTrack(t.id)}
                >
                  {t.label || t.lang}
                </button>
              ))}
            </div>
          </section>
        )}

        {canSetQuality && qualities.length > 0 && (
          <section className="kino-sheet-section">
            <h3 className="kino-sheet-title">Quality</h3>
            <div className="kino-sheet-chips">
              <button
                type="button"
                className="kino-sheet-chip"
                data-active={activeQuality === "auto"}
                aria-pressed={activeQuality === "auto"}
                onClick={() => actions.setQuality("auto")}
              >
                Auto
              </button>
              {sortedQualities.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="kino-sheet-chip"
                  data-active={activeQuality === q.id}
                  aria-pressed={activeQuality === q.id}
                  onClick={() => actions.setQuality(q.id)}
                >
                  {heightKeyword(q.height)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
