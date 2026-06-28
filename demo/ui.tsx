import { useState, type ReactNode } from "react"
import { CheckIcon, CopyIcon } from "./icons"
import { useHighlighted, type CodeLang } from "./highlight"

/* Shared button treatments — reused verbatim across every page so the primary
   and secondary actions stay consistent. There is exactly one primary (amber)
   action per page; everything else is a ghost/outline secondary. */
export const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-leader px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-leader-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader sm:py-2"
export const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-paper ring-1 ring-white/12 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader sm:py-2"

/* Invisible 48px hit area for small/icon controls on touch devices. */
export function TouchTarget() {
  return (
    <span
      aria-hidden="true"
      className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
    />
  )
}

/* Mono, tracked, amber section label. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[0.8125rem] font-medium tracking-wide text-leader uppercase">
      {children}
    </p>
  )
}

/* A film-frame index marker, e.g. "01" — the cinema stand-in for a feature icon. */
export function FrameNumber({ n }: { n: string }) {
  return (
    <span className="inline-grid h-7 w-fit min-w-9 place-items-center rounded-md px-1.5 font-mono text-[0.8125rem] text-leader ring-1 ring-leader/30 tabular-nums">
      {n}
    </span>
  )
}

type BadgeTone = "shipped" | "planned"
export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone
  children: ReactNode
}) {
  const tones: Record<BadgeTone, string> = {
    shipped: "py-1 pr-2 pl-1.5 text-leader ring-leader/30 bg-leader/10",
    planned: "px-2 py-1 text-paper-faint ring-white/10",
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full text-[0.8125rem] font-medium ring-1 ${tones[tone]}`}
    >
      {tone === "shipped" && (
        <span className="size-1.5 rounded-full bg-leader" aria-hidden="true" />
      )}
      {children}
    </span>
  )
}

/* Inline code token. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-white/6 px-1.5 py-0.5 font-mono text-[0.875em] text-paper">
      {children}
    </code>
  )
}

export function useCopied() {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  return { copied, copy }
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string
  label?: string
}) {
  const { copied, copy } = useCopied()
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={copied ? "Copied" : label}
      className="relative inline-grid size-8 place-items-center rounded-lg text-paper-dim ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader"
    >
      {copied ? (
        <CheckIcon className="size-4 text-leader" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      <TouchTarget />
    </button>
  )
}

/* Copies a page's markdown representation for pasting into an LLM. */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const { copied, copy } = useCopied()
  return (
    <button
      type="button"
      onClick={() => copy(markdown)}
      aria-label={copied ? "Copied" : "Copy page as Markdown"}
      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[0.8125rem] text-paper-dim ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-leader" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy as Markdown"}
    </button>
  )
}

/* The Shiki-highlighted (or plain fallback) body shared by the code surfaces. */
function CodeBody({ code, html }: { code: string; html: string | null }) {
  return html ? (
    <div
      className="code-scroll overflow-x-auto text-sm/6 [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-4 [&_pre]:font-mono"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <div className="code-scroll overflow-x-auto">
      <pre className="p-4 font-mono text-sm/6 text-paper-dim">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* Copyable code block with a mono caption bar and Shiki syntax highlighting. */
export function CodeBlock({
  code,
  label,
  lang = "tsx",
}: {
  code: string
  label: string
  lang?: CodeLang
}) {
  const html = useHighlighted(code, lang)
  return (
    <figure className="overflow-hidden rounded-xl bg-ink-raised ring-1 ring-white/10">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
        <span className="font-mono text-[0.8125rem] text-paper-faint">
          {label}
        </span>
        <CopyButton text={code} label="Copy code" />
      </figcaption>
      <CodeBody code={code} html={html} />
    </figure>
  )
}

const PACKAGE_MANAGERS = [
  { id: "pnpm", cmd: "pnpm add @karnstack/kino" },
  { id: "npm", cmd: "npm install @karnstack/kino" },
  { id: "yarn", cmd: "yarn add @karnstack/kino" },
  { id: "bun", cmd: "bun add @karnstack/kino" },
] as const

/* Install command with a package-manager tab bar (defaults to pnpm). */
export function InstallCommand() {
  const [pm, setPm] = useState<(typeof PACKAGE_MANAGERS)[number]["id"]>("pnpm")
  const active =
    PACKAGE_MANAGERS.find((p) => p.id === pm) ?? PACKAGE_MANAGERS[0]
  const html = useHighlighted(active.cmd, "bash")
  return (
    <figure className="overflow-hidden rounded-xl bg-ink-raised ring-1 ring-white/10">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/8 pr-2 pl-1">
        <div role="tablist" aria-label="Package manager" className="flex">
          {PACKAGE_MANAGERS.map((p) => {
            const selected = pm === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPm(p.id)}
                className={[
                  "relative px-3 py-2.5 font-mono text-[0.8125rem] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-leader",
                  selected
                    ? "text-paper"
                    : "text-paper-faint hover:text-paper-dim",
                ].join(" ")}
              >
                {p.id}
                {selected && (
                  <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-leader" />
                )}
              </button>
            )
          })}
        </div>
        <CopyButton text={active.cmd} label="Copy install command" />
      </figcaption>
      <CodeBody code={active.cmd} html={html} />
    </figure>
  )
}

/* Responsive data table — bare on the background, horizontal row dividers only,
   scrolls horizontally on narrow screens. */
export function Table({
  head,
  rows,
}: {
  head: string[]
  rows: { key: string; cells: ReactNode[] }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/12">
            {head.map((h) => (
              <th
                key={h}
                className="py-2.5 pr-6 text-sm font-medium whitespace-nowrap text-paper-faint last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-white/8 last:border-0">
              {row.cells.map((cell, j) => (
                <td
                  key={j}
                  className="py-3 pr-6 align-top text-sm text-pretty text-paper-dim first:font-mono first:whitespace-nowrap first:text-paper last:pr-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Shared page heading group for the doc pages. Left-aligned, individually
   width-constrained per the heading-group rules. */
export function PageHeader({
  eyebrow,
  title,
  lead,
  markdown,
}: {
  eyebrow: string
  title: string
  lead: string
  markdown?: string
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        {markdown && <CopyMarkdownButton markdown={markdown} />}
      </div>
      <h1 className="max-w-[20ch] font-display text-4xl font-semibold tracking-tight text-balance text-paper sm:text-5xl">
        {title}
      </h1>
      <p className="max-w-[60ch] text-lg/8 text-pretty text-paper-dim">
        {lead}
      </p>
    </header>
  )
}
