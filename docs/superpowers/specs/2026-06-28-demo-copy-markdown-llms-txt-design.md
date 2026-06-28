# Demo: Copy-as-Markdown buttons + `/llms.txt` — design

**Goal:** Make the kino demo site (kino.karnstack.com) easy to feed to an LLM:
a per-page "Copy as Markdown" button, and a root `/llms.txt` index following the
[llms.txt standard](https://llmstxt.org).

**Status:** approved 2026-06-28. Scope ~5 files in `demo/`.

## Decisions (user-approved)

- **llms.txt delivery:** static file at `/llms.txt` (not a rendered SPA page) —
  correct `text/markdown` content type, the location crawlers/LLMs fetch. Plus a
  discoverable footer link.
- **llms.txt depth:** index only (summary + curated links). No `llms-full.txt`.
- **Markdown source:** co-located per-page markdown const. No DOM-derivation, no
  markdown-render library.

## Components

### 1. Per-page markdown source
Each page file (`overview`, `install`, `providers`, `theming`) gains a
co-located `const markdown = \`…\`` — a concise, LLM-pasteable markdown of the
page: H1 title, the prose, and the key code blocks. Authored to be useful to an
LLM, not a literal DOM mirror. Kept in rough sync with the JSX by hand (4 small
pages, low churn).

### 2. `CopyMarkdownButton` (shared, `demo/ui.tsx`)
Reuses the existing `useCopied()` hook (clipboard + 1.4s copied state). A labeled
secondary button: `CopyIcon` + "Copy as Markdown", flipping to `CheckIcon` +
"Copied". Rendered by `PageHeader` when given an optional `markdown` prop
(top-right of the eyebrow row); the overview hero renders it inline near its
eyebrow.

### 3. `/llms.txt` static file (`demo/public/llms.txt`)
New `demo/public/` dir (Vite `root: demo` serves `public/` at the site root and
copies it to `demo/dist/` on build; the Worker serves `demo/dist` static assets
ahead of its SPA fallback). Hand-authored to the standard:
- `# kino` + a one-line blockquote summary
- `## Docs` — links to the four pages (absolute `https://kino.karnstack.com/…`)
  with a short note each
- `## Reference` — npm entry points (`@karnstack/kino`, `/mux`, `/native`,
  `/youtube`, `/vimeo`), the GitHub repo, and the README

A footer link to `/llms.txt` in `shell.tsx` makes it discoverable.

## Out of scope (YAGNI)
`llms-full.txt`; DOM-derived markdown; a markdown-render dependency; any router
or build-pipeline change beyond adding `demo/public/`.

## Verification
No demo unit tests exist. Gate: `pnpm build` emits `demo/dist/llms.txt`;
`pnpm typecheck` + `pnpm lint` clean; a headless screenshot of a doc page shows
the button.
