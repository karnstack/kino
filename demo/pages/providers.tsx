import { Badge, Code, CodeBlock, Eyebrow, PageHeader } from "../ui"

type ProviderCard = {
  name: string
  status: "shipped" | "planned"
  entry?: string
  detail: string
  importLine?: string
}

const PROVIDERS: ProviderCard[] = [
  {
    name: "Mux",
    status: "shipped",
    entry: "@karnstack/kino/mux",
    detail:
      "Adaptive HLS through the @mux/mux-video element — renditions, storyboard scrub previews, captions, and signed playback.",
    importLine: 'import { MuxPlayer } from "@karnstack/kino/mux"',
  },
  {
    name: "Native",
    status: "shipped",
    entry: "@karnstack/kino/native",
    detail:
      "A native <video> element over any raw mp4, webm, or ogg URL. No streaming engine, no account, nothing to register.",
    importLine: 'import { NativePlayer } from "@karnstack/kino/native"',
  },
  {
    name: "YouTube",
    status: "shipped",
    entry: "@karnstack/kino/youtube",
    detail:
      "The YouTube IFrame Player API wrapped in the same kino chrome — kino owns the controls, keyboard map, and captions menu. Quality and PiP follow YouTube's API limits.",
    importLine: 'import { YouTubePlayer } from "@karnstack/kino/youtube"',
  },
  {
    name: "Vimeo",
    status: "shipped",
    entry: "@karnstack/kino/vimeo",
    detail:
      "The Vimeo Player SDK under the same kino chrome — quality, styled captions, picture-in-picture, and rate. Chromeless playback needs a paid Vimeo plan.",
    importLine: 'import { VimeoPlayer } from "@karnstack/kino/vimeo"',
  },
]

const PROVIDER_CONTRACT = `export interface Provider {
  mount(container: HTMLElement): void
  getState(): MediaState
  subscribe(listener: () => void): () => void
  actions: PlayerActions
  destroy(): void
  // Optional: change source on the existing element, preserving
  // DOM and fullscreen continuity.
  swapSource?(opts: SourceOptions): void
}`

export function ProvidersPage() {
  return (
    <div className="flex flex-col gap-16">
      <PageHeader
        eyebrow="Architecture"
        title="One UI, many engines."
        lead="kino ships the player UI and a provider contract. Each provider adapts a streaming engine to that contract, so the same glass chrome can sit on top of any backend."
      />

      <section className="flex flex-col gap-6">
        <ul role="list" className="grid gap-5 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <li
              key={p.name}
              className="flex flex-col gap-4 rounded-2xl bg-ink-raised p-6 ring-1 ring-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">
                  {p.name}
                </h2>
                <Badge tone={p.status}>
                  {p.status === "shipped" ? "Shipped" : "Planned"}
                </Badge>
              </div>
              <p className="text-base/7 text-pretty text-paper-dim">
                {p.detail}
              </p>
              {p.importLine ? (
                <div className="code-scroll mt-auto overflow-x-auto rounded-lg bg-black/40 px-3.5 py-2.5 ring-1 ring-white/8">
                  <code className="font-mono text-[0.75rem] whitespace-nowrap text-paper-dim">
                    {p.importLine}
                  </code>
                </div>
              ) : (
                <p className="mt-auto font-mono text-[0.8125rem] text-paper-faint">
                  On the roadmap.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>The contract</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            A provider is a handful of methods.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Implement <Code>mount</Code>, a <Code>getState</Code> /{" "}
            <Code>subscribe</Code> pair, an <Code>actions</Code> object, and{" "}
            <Code>destroy</Code>. The UI reads everything through this surface —
            it never talks to an engine directly.
          </p>
        </div>
        <CodeBlock code={PROVIDER_CONTRACT} label="core/types.ts" lang="ts" />
      </section>
    </div>
  )
}
