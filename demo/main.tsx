import { useState, type CSSProperties, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { MuxPlayer } from "../src/mux/mux-player"
import { KinoLogo, KinoMark } from "./logo"
import "../src/styles/kino.css"
import "./styles.css"

// Two public Mux assets (no signed tokens needed) so the playground plays real
// HLS, storyboard scrub previews, and quality switching out of the box. Anyone
// can also paste their own public Mux playback id in the console.
const SAMPLES = [
  { id: "01b2r4H6Pg8Q01NJZGppCu6X6tmfP6f6Jtp5oFZaETUwU", label: "Sample one" },
  { id: "a4nOgmxGWg6gULfcBbAa00gXyfcwPnAFldF8RdsNyk8M", label: "Sample two" },
] as const

// Curated, mid-lightness accents that all carry white control glyphs well. The
// first is kino's built-in default. A native color input covers everything else.
const DEFAULT_ACCENT = "oklch(50.8% 0.118 165.612)"
const ACCENTS = [
  { name: "Emerald", value: DEFAULT_ACCENT },
  { name: "Teal", value: "oklch(56% 0.1 195)" },
  { name: "Blue", value: "oklch(56% 0.16 245)" },
  { name: "Violet", value: "oklch(55% 0.2 290)" },
  { name: "Pink", value: "oklch(58% 0.21 350)" },
  { name: "Rose", value: "oklch(57% 0.2 18)" },
  { name: "Orange", value: "oklch(62% 0.16 50)" },
] as const

const DEFAULT_RADIUS = 12
const GITHUB_URL = "https://github.com/karnstack/kino"
const NPM_INSTALL = "npm i @karnstack/kino"

const muxThumb = (id: string) =>
  `https://image.mux.com/${id}/thumbnail.webp?width=480&height=270&fit_mode=smartcrop`

// Accept a bare playback id or a stream/image/thumbnail URL and pull the id out.
function parsePlaybackId(raw: string): string {
  const s = raw.trim()
  if (!s) return ""
  const url = s.match(/mux\.com\/([^/?.#]+)/i)
  if (url?.[1]) return url[1]
  return s.replace(/\.m3u8.*$/i, "").replace(/[?#].*$/, "")
}

function App() {
  const [source, setSource] = useState<string>(SAMPLES[0].id)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)

  const activeSample = SAMPLES.find((s) => s.id === source)

  const loadDraft = (e: React.FormEvent) => {
    e.preventDefault()
    const id = parsePlaybackId(draft)
    if (id.length < 8) {
      setError("That doesn't look like a Mux playback ID.")
      return
    }
    setError(null)
    setSource(id)
  }

  const reset = () => {
    setSource(SAMPLES[0].id)
    setDraft("")
    setError(null)
    setAccent(DEFAULT_ACCENT)
    setRadius(DEFAULT_RADIUS)
  }

  const themeLine =
    radius !== DEFAULT_RADIUS
      ? `\n  theme={{ "--kino-radius": "${radius}px" }}`
      : ""
  const snippet = `import { MuxPlayer } from "@karnstack/kino/mux"
import "@karnstack/kino/styles.css"

<MuxPlayer
  playbackId="${source}"
  accentColor="${accent}"${themeLine}
/>`

  return (
    <div
      className="min-h-screen"
      style={{ "--accent": accent } as CSSProperties}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Header />

        <main className="pb-16">
          <section className="pt-2 pb-8 sm:pt-6 sm:pb-10">
            <p className="font-mono text-xs font-medium tracking-wide text-(--accent) uppercase">
              Playground
            </p>
            <h1 className="mt-3 max-w-[18ch] text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              The kino player, live in your browser.
            </h1>
            <p className="mt-3 max-w-[60ch] text-base text-pretty text-zinc-400">
              Drop in any public Mux playback ID, pick an accent, and play with
              the real glass UI — keyboard shortcuts, scrub previews, captions,
              quality switching. No account or signed tokens required.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
            <PlayerColumn
              source={source}
              accent={accent}
              radius={radius}
              label={activeSample?.label ?? "Custom source"}
            />
            <Console
              source={source}
              setSource={(id) => {
                setSource(id)
                setError(null)
              }}
              draft={draft}
              setDraft={setDraft}
              error={error}
              loadDraft={loadDraft}
              accent={accent}
              setAccent={setAccent}
              radius={radius}
              setRadius={setRadius}
              snippet={snippet}
              onReset={reset}
            />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <KinoLogo />
      <div className="flex items-center gap-2 sm:gap-3">
        <CopyChip
          text={NPM_INSTALL}
          className="hidden font-mono text-[13px] text-zinc-400 sm:inline-flex"
        />
        <span className="hidden h-7 items-center rounded-full bg-white/5 px-2.5 font-mono text-[11px] text-zinc-400 ring-1 ring-white/10 sm:inline-flex">
          v{__KINO_VERSION__}
        </span>
        <IconLink href={GITHUB_URL} label="kino on GitHub">
          <GitHubIcon />
        </IconLink>
      </div>
    </header>
  )
}

function PlayerColumn({
  source,
  accent,
  radius,
  label,
}: {
  source: string
  accent: string
  radius: number
  label: string
}) {
  return (
    <div>
      <div className="relative">
        {/* Faint accent wash under the frame. */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-4 -bottom-6 top-16 -z-10 rounded-[40px] opacity-15 blur-2xl"
          style={{ background: accent }}
        />
        <div
          className="relative overflow-hidden ring-1 ring-white/10 shadow-[0_30px_90px_-25px_rgba(0,0,0,0.85)]"
          style={{ borderRadius: radius, aspectRatio: "16 / 9" }}
        >
          <MuxPlayer
            playbackId={source}
            accentColor={accent}
            theme={{ "--kino-radius": `${radius}px` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
          <span
            className="size-2 rounded-full"
            style={{ background: accent }}
            aria-hidden="true"
          />
          Now playing · {label}
        </span>
        <code className="min-w-0 truncate font-mono text-[12.5px] text-zinc-500">
          {source}
        </code>
      </div>
    </div>
  )
}

type ConsoleProps = {
  source: string
  setSource: (id: string) => void
  draft: string
  setDraft: (v: string) => void
  error: string | null
  loadDraft: (e: React.FormEvent) => void
  accent: string
  setAccent: (v: string) => void
  radius: number
  setRadius: (v: number) => void
  snippet: string
  onReset: () => void
}

function Console(props: ConsoleProps) {
  return (
    <aside className="overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <KinoMark className="size-4 text-(--accent)" />
          Console
        </h2>
        <button
          type="button"
          onClick={props.onReset}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          Reset
        </button>
      </div>

      <Section title="Source">
        <div className="grid grid-cols-2 gap-3">
          {SAMPLES.map((s) => {
            const active = props.source === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => props.setSource(s.id)}
                aria-pressed={active}
                className={[
                  "group relative aspect-video overflow-hidden rounded-xl text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
                  active
                    ? "ring-2 ring-(--accent)"
                    : "opacity-80 ring-1 ring-white/10 hover:opacity-100",
                ].join(" ")}
              >
                <img
                  src={muxThumb(s.id)}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <span className="absolute bottom-2 left-2.5 text-[13px] font-medium text-white">
                  {s.label}
                </span>
                {active && (
                  <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-(--accent) text-white">
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <form onSubmit={props.loadDraft} className="mt-4">
          <label
            htmlFor="pg-playback-id"
            className="mb-1.5 block text-[13px] font-medium text-zinc-300"
          >
            Or paste a Mux playback ID
          </label>
          <div className="flex gap-2">
            <input
              id="pg-playback-id"
              name="playbackId"
              value={props.draft}
              onChange={(e) => props.setDraft(e.target.value)}
              placeholder="e.g. a4nOgmxGWg6g…"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 font-mono text-[13px] text-white ring-1 ring-white/10 transition placeholder:text-zinc-500 focus-visible:bg-white/[0.07] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--accent) max-sm:text-base"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-(--accent) px-3.5 py-2 text-sm font-semibold text-white transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              Load
            </button>
          </div>
          {props.error ? (
            <p className="mt-1.5 text-[13px] text-rose-400">{props.error}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-zinc-500">
              Any public Mux playback ID works — stream URLs are accepted too.
            </p>
          )}
        </form>
      </Section>

      <Section title="Accent">
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((a) => {
            const active = props.accent === a.value
            return (
              <button
                key={a.name}
                type="button"
                title={a.name}
                aria-label={a.name}
                aria-pressed={active}
                onClick={() => props.setAccent(a.value)}
                style={{ background: a.value }}
                className={[
                  "relative grid size-8 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
                  active
                    ? "ring-2 ring-white"
                    : "ring-1 ring-white/15 hover:scale-110",
                ].join(" ")}
              >
                {active && <CheckIcon className="size-4 text-white" />}
                <TouchTarget />
              </button>
            )
          })}
          <label
            className="relative grid size-8 cursor-pointer place-items-center rounded-full ring-1 ring-white/15 transition hover:scale-110"
            style={{
              background:
                "conic-gradient(from 90deg, #f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #ec4899, #f43f5e)",
            }}
            title="Custom color"
          >
            <input
              type="color"
              name="accentCustom"
              aria-label="Custom accent color"
              onChange={(e) => props.setAccent(e.target.value)}
              className="pg-color absolute inset-0 size-full rounded-full opacity-0"
            />
            <PlusIcon className="size-4 text-white drop-shadow" />
          </label>
        </div>
        <p className="mt-2.5 font-mono text-[12px] text-zinc-500">
          {props.accent}
        </p>
      </Section>

      <Section title="Corner radius">
        <div className="flex items-center gap-3">
          <input
            type="range"
            name="radius"
            aria-label="Corner radius in pixels"
            min={0}
            max={28}
            step={1}
            value={props.radius}
            onChange={(e) => props.setRadius(Number(e.target.value))}
            className="pg-range"
          />
          <span className="w-12 shrink-0 text-right font-mono text-[13px] tabular-nums text-zinc-300">
            {props.radius}px
          </span>
        </div>
      </Section>

      <Section title="Code">
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-black/40 p-4 pr-12 font-mono text-[12.5px] leading-relaxed text-zinc-300 ring-1 ring-white/10">
            {props.snippet}
          </pre>
          <div className="absolute top-2.5 right-2.5">
            <CopyButton text={props.snippet} />
          </div>
        </div>
      </Section>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 px-5 py-5">
      <h3 className="mb-3 font-mono text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-8 text-sm text-zinc-500 sm:flex-row">
      <p>
        <span className="font-medium text-zinc-300">kino</span> — themeable
        React video player · MIT
      </p>
      <div className="flex items-center gap-4">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-zinc-200"
        >
          GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/@karnstack/kino"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-zinc-200"
        >
          npm
        </a>
      </div>
    </footer>
  )
}

/* ---------------------------------------------------------------- bits ---- */

function useCopied() {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  return { copied, copy }
}

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopied()
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={copied ? "Copied" : "Copy code"}
      className="relative grid size-8 place-items-center rounded-lg bg-zinc-800 text-zinc-300 ring-1 ring-white/10 transition hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      {copied ? (
        <CheckIcon className="size-4 text-(--accent)" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      <TouchTarget />
    </button>
  )
}

function CopyChip({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopied()
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className={[
        "items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10 transition hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-zinc-500">$</span>
      {text}
      {copied ? (
        <CheckIcon className="size-3.5 text-(--accent)" />
      ) : (
        <CopyIcon className="size-3.5 opacity-60" />
      )}
    </button>
  )
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="relative grid size-9 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      {children}
      <TouchTarget />
    </a>
  )
}

// Invisible 48px hit area for small/icon controls on touch devices.
function TouchTarget() {
  return (
    <span
      aria-hidden="true"
      className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
    />
  )
}

/* --------------------------------------------------------------- icons ---- */

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.85.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.34 9.34 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("#root not found")
createRoot(rootEl).render(<App />)
