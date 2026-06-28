import { Link } from "../router"
import { PlayerStudio } from "../player-studio"
import {
  btnPrimary,
  btnSecondary,
  CopyButton,
  Eyebrow,
  FrameNumber,
} from "../ui"
import { ArrowRightIcon } from "../icons"

const INSTALL = "pnpm add @karnstack/kino"

const HIGHLIGHTS = [
  {
    n: "01",
    term: "Pluggable providers",
    detail:
      "One UI contract, many engines. Mux HLS and raw files ship today; YouTube and Vimeo are next.",
  },
  {
    n: "02",
    term: "Keyboard-first",
    detail:
      "Play, seek, speed, captions, and fullscreen are all driven from the keyboard out of the box.",
  },
  {
    n: "03",
    term: "Themeable",
    detail:
      "Set the accent with a single prop, or repaint every surface through CSS custom properties.",
  },
  {
    n: "04",
    term: "Capability-aware",
    detail:
      "Controls hide themselves when the active engine or platform can't support them — never a dead button.",
  },
]

export function OverviewPage() {
  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      <section className="flex flex-col gap-7 pt-2">
        <Eyebrow>React video player</Eyebrow>
        <div>
          <h1 className="max-w-[18ch] font-display text-5xl font-semibold tracking-tight text-balance text-paper sm:text-6xl">
            Glass chrome for every video.
          </h1>
          <p className="mt-6 max-w-[56ch] text-lg/8 text-pretty text-paper-dim">
            kino is a themeable React video player with a pluggable-provider
            architecture. The same translucent, keyboard-first UI sits over Mux,
            raw files, and more — behind a small typed surface.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/install" className={btnPrimary}>
            Read the docs
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link to="/providers" className={btnSecondary}>
            Browse providers
          </Link>
          <div className="flex h-10 items-center gap-2 rounded-xl bg-white/5 pr-1 pl-3.5 ring-1 ring-white/10 sm:h-9">
            <code className="font-mono text-sm text-paper-dim">
              <span className="text-paper-faint">$ </span>
              {INSTALL}
            </code>
            <CopyButton text={INSTALL} label="Copy install command" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <Eyebrow>Live</Eyebrow>
        <PlayerStudio />
      </section>

      <section className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Eyebrow>Why kino</Eyebrow>
          <h2 className="max-w-[24ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper sm:text-4xl">
            A small surface, fully in your control.
          </h2>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/8 ring-1 ring-white/10 sm:grid-cols-2">
          {HIGHLIGHTS.map((h) => (
            <div key={h.n} className="flex flex-col gap-3 bg-ink p-6 sm:p-7">
              <FrameNumber n={h.n} />
              <dt className="text-lg font-medium text-paper">{h.term}</dt>
              <dd className="text-base/7 text-pretty text-paper-dim">
                {h.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
