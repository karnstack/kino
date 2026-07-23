import { useState, type CSSProperties } from "react"
import { MuxPlayer } from "../src/mux/mux-player"
import { NativePlayer } from "../src/native/native-player"
import { YouTubePlayer } from "../src/youtube/youtube-player"
import { VimeoPlayer } from "../src/vimeo/vimeo-player"
import { ScenesPlayer } from "../src/scenes/scenes-player"
import { CheckIcon } from "./icons"
import { TouchTarget } from "./ui"

export type Mode = "mux" | "vimeo" | "native" | "youtube" | "scenes"

// Public sample assets so the studio plays real media with no account or signed
// tokens — anyone who clones the repo gets the full UI.
const SAMPLES = [
  { id: "01b2r4H6Pg8Q01NJZGppCu6X6tmfP6f6Jtp5oFZaETUwU", label: "Sample one" },
  { id: "a4nOgmxGWg6gULfcBbAa00gXyfcwPnAFldF8RdsNyk8M", label: "Sample two" },
] as const

const NATIVE_SAMPLE = {
  src: "https://www.papytane.com/mp4/accrobra.mp4",
  label: "accrobra · mp4",
} as const

// A public, embeddable Creative Commons video so the YouTube tab plays for
// anyone who clones the repo.
const YOUTUBE_SAMPLE = {
  id: "aqz-KE-bpKQ",
  label: "Big Buck Bunny · YouTube",
} as const

// A public Vimeo staff-pick video so the Vimeo tab plays for anyone who clones
// the repo.
const VIMEO_SAMPLE = {
  id: "291235566",
  label: "Vimeo staff pick · Vimeo",
} as const

// The scenes fixture sequence ships with the demo, so the Scenes tab plays the
// same audio-driven sequence as /scenes.html from the site's own origin.
const SCENES_SAMPLE = {
  src: "/scenes-host.html",
  captions: "/demo.vtt",
  label: "Demo sequence · Scenes",
} as const

export const DEFAULT_ACCENT = "#f4b942"
const ACCENTS = [
  { name: "Leader", value: DEFAULT_ACCENT },
  { name: "Ember", value: "#e3492f" },
  { name: "Sodium", value: "oklch(62% 0.16 50)" },
  { name: "Teal", value: "oklch(56% 0.1 195)" },
  { name: "Cobalt", value: "oklch(56% 0.16 245)" },
  { name: "Violet", value: "oklch(55% 0.2 290)" },
] as const

const DEFAULT_RADIUS = 14

const muxThumb = (id: string) =>
  `https://image.mux.com/${id}/thumbnail.webp?width=480&height=270&fit_mode=smartcrop`

type StudioProps = {
  showSource?: boolean
  showRadius?: boolean
}

export function PlayerStudio({
  showSource = true,
  showRadius = true,
}: StudioProps) {
  const [mode, setMode] = useState<Mode>("mux")
  const [source, setSource] = useState<string>(SAMPLES[0].id)
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)
  const [chromeTheme, setChromeTheme] = useState<"light" | "dark">("dark")

  // The Source picker swaps the Mux playback id; the embed providers each play a
  // single fixed sample, so it only applies to Mux.
  const sourceVisible = showSource && mode === "mux"

  const activeSample = SAMPLES.find((s) => s.id === source)
  const label =
    mode === "native"
      ? NATIVE_SAMPLE.label
      : mode === "youtube"
        ? YOUTUBE_SAMPLE.label
        : mode === "vimeo"
          ? VIMEO_SAMPLE.label
          : mode === "scenes"
            ? SCENES_SAMPLE.label
            : activeSample?.label
  const code =
    mode === "native"
      ? NATIVE_SAMPLE.src
      : mode === "youtube"
        ? YOUTUBE_SAMPLE.id
        : mode === "vimeo"
          ? VIMEO_SAMPLE.id
          : mode === "scenes"
            ? SCENES_SAMPLE.src
            : source

  return (
    <div className="flex flex-col gap-5">
      {/* Frame */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute -inset-x-6 -bottom-8 top-10 -z-10 rounded-[40px] opacity-20 blur-3xl"
          style={{ background: accent }}
        />
        <div
          className="relative overflow-hidden bg-black ring-1 ring-white/10 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
          style={{ borderRadius: radius, aspectRatio: "16 / 9" }}
        >
          {mode === "native" ? (
            <NativePlayer
              key="native"
              src={NATIVE_SAMPLE.src}
              accentColor={accent}
              theme={{ "--kino-radius": `${radius}px` }}
            />
          ) : mode === "youtube" ? (
            <YouTubePlayer
              key="youtube"
              videoId={YOUTUBE_SAMPLE.id}
              accentColor={accent}
              theme={{ "--kino-radius": `${radius}px` }}
            />
          ) : mode === "vimeo" ? (
            <VimeoPlayer
              key="vimeo"
              videoId={VIMEO_SAMPLE.id}
              accentColor={accent}
              theme={{ "--kino-radius": `${radius}px` }}
            />
          ) : mode === "scenes" ? (
            <ScenesPlayer
              key="scenes"
              src={SCENES_SAMPLE.src}
              captions={{
                src: SCENES_SAMPLE.captions,
                label: "English",
                srclang: "en",
              }}
              accentColor={accent}
              chromeTheme={chromeTheme}
              theme={{ "--kino-radius": `${radius}px` }}
            />
          ) : (
            <MuxPlayer
              key="mux"
              playbackId={source}
              accentColor={accent}
              theme={{ "--kino-radius": `${radius}px` }}
            />
          )}
        </div>
      </div>

      {/* Now playing strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-paper">
          <span
            className="size-2 rounded-full"
            style={{ background: accent }}
            aria-hidden="true"
          />
          Now playing · {label}
        </span>
        <code className="min-w-0 truncate font-mono text-[0.8125rem] text-paper-faint">
          {code}
        </code>
      </div>

      {/* Controls */}
      <div className="grid gap-px overflow-hidden rounded-2xl bg-white/8 ring-1 ring-white/10 sm:grid-cols-2">
        <Control label="Provider" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "mux", label: "Mux · HLS" },
                { id: "vimeo", label: "Vimeo · Embed" },
                { id: "native", label: "Native · mp4" },
                { id: "youtube", label: "YouTube · Embed" },
                { id: "scenes", label: "Scenes · DOM" },
              ] as const
            ).map((p) => {
              const active = mode === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMode(p.id)}
                  aria-pressed={active}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader",
                    active
                      ? "bg-leader text-ink"
                      : "text-paper-dim ring-1 ring-white/12 hover:bg-white/5 hover:text-paper",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </Control>

        {sourceVisible && (
          <Control
            label="Source"
            className={showRadius ? undefined : "sm:col-span-2"}
          >
            <div className="grid grid-cols-2 gap-2">
              {SAMPLES.map((s) => {
                const active = mode === "mux" && source === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setMode("mux")
                      setSource(s.id)
                    }}
                    aria-pressed={active}
                    aria-label={s.label}
                    className={[
                      "group relative aspect-video overflow-hidden rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader",
                      active
                        ? "ring-2 ring-leader"
                        : "opacity-75 ring-1 ring-white/10 hover:opacity-100",
                    ].join(" ")}
                  >
                    <img
                      src={muxThumb(s.id)}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                    />
                    {active && (
                      <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-leader text-ink">
                        <CheckIcon className="size-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Control>
        )}

        <Control label="Accent">
          <div className="flex flex-wrap items-center gap-2.5">
            {ACCENTS.map((a) => {
              const active = accent === a.value
              return (
                <button
                  key={a.name}
                  type="button"
                  title={a.name}
                  aria-label={a.name}
                  aria-pressed={active}
                  onClick={() => setAccent(a.value)}
                  style={{ background: a.value }}
                  className={[
                    "relative grid size-7 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader",
                    active
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-ink-raised"
                      : "ring-1 ring-white/15 hover:scale-110",
                  ].join(" ")}
                >
                  {active && <CheckIcon className="size-4 text-ink" />}
                  <TouchTarget />
                </button>
              )
            })}
            <label
              className="relative grid size-7 cursor-pointer place-items-center rounded-full ring-1 ring-white/15 transition hover:scale-110"
              style={{
                background:
                  "conic-gradient(from 90deg, #f4b942, #e3492f, #8b5cf6, #06b6d4, #f4b942)",
              }}
              title="Custom color"
            >
              <input
                type="color"
                name="accentCustom"
                aria-label="Custom accent color"
                onChange={(e) => setAccent(e.target.value)}
                className="pg-color absolute inset-0 size-full rounded-full opacity-0"
              />
            </label>
          </div>
        </Control>

        {/* Chrome light/dark stamps data-kino-theme on the .kino root. Only the
            Scenes provider forwards chromeTheme today, so the swap is live on
            the Scenes tab; the Mux/Vimeo/Native/YouTube wrappers do not accept
            the prop yet (that passthrough lives in the library, not the demo). */}
        <Control
          label="Chrome"
          className={sourceVisible ? "sm:col-span-2" : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {(["dark", "light"] as const).map((t) => {
              const active = chromeTheme === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChromeTheme(t)}
                  aria-pressed={active}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader",
                    active
                      ? "bg-leader text-ink"
                      : "text-paper-dim ring-1 ring-white/12 hover:bg-white/5 hover:text-paper",
                  ].join(" ")}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </Control>

        {showRadius && (
          <Control label="Corner radius" className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                name="radius"
                aria-label="Corner radius in pixels"
                min={0}
                max={28}
                step={1}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="pg-range"
                style={{ "--accent": accent } as CSSProperties}
              />
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-paper-dim">
                {radius}px
              </span>
            </div>
          </Control>
        )}
      </div>
    </div>
  )
}

function Control({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`bg-ink-raised p-4 ${className ?? ""}`}>
      <h3 className="mb-3 font-mono text-[0.8125rem] tracking-wide text-paper-faint uppercase">
        {label}
      </h3>
      {children}
    </section>
  )
}
