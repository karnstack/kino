import { PlayerStudio } from "../player-studio"
import { Code, CodeBlock, Eyebrow, FrameNumber, PageHeader, Table } from "../ui"

const ACCENT_SNIPPET = `<MuxPlayer
  playbackId="..."
  accentColor="oklch(50.8% 0.118 165.612)"
/>`

const CSS_SNIPPET = `.kino {
  --kino-accent: oklch(70% 0.15 250);
  --kino-radius: 16px;
  --kino-blur: 24px;
}`

const CSS_VARS: [string, string, string][] = [
  [
    "--kino-accent",
    "oklch(50.8% 0.118 165.612)",
    "Progress, active items, ranges",
  ],
  ["--kino-radius", "12px", "Corner radius of glass surfaces"],
  [
    "--kino-surface",
    "color-mix(in oklab, black 55%, transparent)",
    "Glass surface fill",
  ],
  [
    "--kino-surface-strong",
    "color-mix(in oklab, black 70%, transparent)",
    "Stronger surface (idle play)",
  ],
  [
    "--kino-border",
    "color-mix(in oklab, white 14%, transparent)",
    "Hairline borders",
  ],
  ["--kino-text", "oklch(98% 0 0)", "Primary text and icons"],
  [
    "--kino-text-dim",
    "color-mix(in oklab, white 65%, transparent)",
    "Secondary text (timecode)",
  ],
  ["--kino-blur", "18px", "Backdrop blur radius"],
  ["--kino-shadow", "0 8px 40px rgba(0,0,0,0.45)", "Surface drop shadow"],
  ["--kino-ease", "cubic-bezier(0.22, 1, 0.36, 1)", "Shared transition easing"],
]

const KEYS: [string, string][] = [
  ["Space / K", "Play / pause"],
  ["< / >", "Decrease / increase playback rate"],
  ["M", "Toggle mute"],
  ["C", "Toggle captions"],
  ["S", "Open the speed menu"],
  ["F", "Toggle fullscreen"],
  ["0 – 9", "Seek to 0% – 90% of the duration"],
]

const CAPABILITIES = [
  {
    n: "01",
    term: "Quality switching",
    detail:
      "Hidden when the engine exposes no renditions, and off on iOS where the system owns adaptive playback.",
  },
  {
    n: "02",
    term: "Fullscreen",
    detail:
      "Custom-chrome fullscreen is off on iOS — the platform uses its native fullscreen for the underlying video.",
  },
  {
    n: "03",
    term: "Picture-in-picture",
    detail: "Hidden when the browser does not support the PiP API.",
  },
  {
    n: "04",
    term: "Captions",
    detail:
      "The captions menu appears only when the media actually carries subtitle or caption tracks.",
  },
]

const markdown = `# Make it yours.

The quickest knob is the accentColor prop. For deeper control, every visual is driven by CSS custom properties on the .kino root — override them in your own stylesheet or pass a theme object inline.

## Accent prop

\`\`\`tsx
${ACCENT_SNIPPET}
\`\`\`

## Custom properties

| Property | Default | Role |
|---|---|---|
| --kino-accent | oklch(50.8% 0.118 165.612) | Progress, active items, ranges |
| --kino-radius | 12px | Corner radius of glass surfaces |
| --kino-surface | color-mix(in oklab, black 55%, transparent) | Glass surface fill |
| --kino-surface-strong | color-mix(in oklab, black 70%, transparent) | Stronger surface (idle play) |
| --kino-border | color-mix(in oklab, white 14%, transparent) | Hairline borders |
| --kino-text | oklch(98% 0 0) | Primary text and icons |
| --kino-text-dim | color-mix(in oklab, white 65%, transparent) | Secondary text (timecode) |
| --kino-blur | 18px | Backdrop blur radius |
| --kino-shadow | 0 8px 40px rgba(0,0,0,0.45) | Surface drop shadow |
| --kino-ease | cubic-bezier(0.22, 1, 0.36, 1) | Shared transition easing |

\`\`\`css
${CSS_SNIPPET}
\`\`\`

## Keyboard

Shortcuts are ignored while a text field is focused, and modifier combinations pass straight through.

| Key | Action |
|---|---|
| Space / K | Play / pause |
| < / > | Decrease / increase playback rate |
| M | Toggle mute |
| C | Toggle captions |
| S | Open the speed menu |
| F | Toggle fullscreen |
| 0 – 9 | Seek to 0% – 90% of the duration |

## Capability gating

Each provider reports a capability set, and every control checks it before rendering — so the chrome only ever shows what the current engine and platform can actually do.

**01 — Quality switching.** Hidden when the engine exposes no renditions, and off on iOS where the system owns adaptive playback.

**02 — Fullscreen.** Custom-chrome fullscreen is off on iOS — the platform uses its native fullscreen for the underlying video.

**03 — Picture-in-picture.** Hidden when the browser does not support the PiP API.

**04 — Captions.** The captions menu appears only when the media actually carries subtitle or caption tracks.`

export function ThemingPage() {
  return (
    <div className="flex flex-col gap-16">
      <PageHeader
        eyebrow="Theming"
        title="Make it yours."
        lead="The quickest knob is the accentColor prop. For deeper control, every visual is driven by CSS custom properties on the .kino root — override them in your own stylesheet or pass a theme object inline."
        markdown={markdown}
      />

      <section className="flex flex-col gap-6">
        <Eyebrow>Try it</Eyebrow>
        <PlayerStudio showSource={false} />
        <CodeBlock code={ACCENT_SNIPPET} label="Accent prop" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>Custom properties</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Repaint every surface.
          </h2>
        </div>
        <Table
          head={["Property", "Default", "Role"]}
          rows={CSS_VARS.map(([name, def, role]) => ({
            key: name,
            cells: [name, <Code key="d">{def}</Code>, role],
          }))}
        />
        <CodeBlock code={CSS_SNIPPET} label="your-styles.css" lang="css" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>Keyboard</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Keyboard-first by default.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Shortcuts are ignored while a text field is focused, and modifier
            combinations pass straight through.
          </p>
        </div>
        <Table
          head={["Key", "Action"]}
          rows={KEYS.map(([key, action]) => ({
            key,
            cells: [key, action],
          }))}
        />
      </section>

      <section className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Eyebrow>Capability gating</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Never a dead button.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Each provider reports a capability set, and every control checks it
            before rendering — so the chrome only ever shows what the current
            engine and platform can actually do.
          </p>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/8 ring-1 ring-white/10 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.n} className="flex flex-col gap-3 bg-ink p-6 sm:p-7">
              <FrameNumber n={c.n} />
              <dt className="text-lg font-medium text-paper">{c.term}</dt>
              <dd className="text-base/7 text-pretty text-paper-dim">
                {c.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
