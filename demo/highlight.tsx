import { useEffect, useState } from "react"
import type { HighlighterCore } from "shiki/core"

// Shiki, dev-only. Everything is dynamically imported so the highlighter (core +
// the four grammars + theme, ~600kB) lands in its own lazy chunk, loaded only
// when a code block first mounts — the landing page never pays for it. "vesper"
// is a warm, muted dark theme; the JS regex engine avoids the oniguruma WASM.
const THEME = "vesper"

export type CodeLang = "tsx" | "ts" | "css" | "bash"
const SHIKI_LANG: Record<CodeLang, string> = {
  tsx: "tsx",
  ts: "typescript",
  css: "css",
  bash: "bash",
}

let highlighterPromise: Promise<HighlighterCore> | null = null
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [core, jsEngine, tsx, typescript, css, bash, vesper] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
          import("shiki/langs/tsx.mjs"),
          import("shiki/langs/typescript.mjs"),
          import("shiki/langs/css.mjs"),
          import("shiki/langs/bash.mjs"),
          import("shiki/themes/vesper.mjs"),
        ])
      return core.createHighlighterCore({
        themes: [vesper.default],
        langs: [tsx.default, typescript.default, css.default, bash.default],
        engine: jsEngine.createJavaScriptRegexEngine(),
      })
    })()
  }
  return highlighterPromise
}

// Returns Shiki-highlighted HTML for the snippet, or null until the highlighter
// has loaded (the caller renders a plain-text fallback in the meantime).
export function useHighlighted(code: string, lang: CodeLang): string | null {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getHighlighter().then((h) => {
      if (!alive) return
      setHtml(h.codeToHtml(code, { lang: SHIKI_LANG[lang], theme: THEME }))
    })
    return () => {
      alive = false
    }
  }, [code, lang])
  return html
}
