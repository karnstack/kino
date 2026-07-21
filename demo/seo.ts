import { useEffect } from "react"
import seo from "./seo.json"

// Single source of truth for per-route head metadata, shared with
// demo/prerender.ts (which bakes the same values into the static HTML that
// crawlers and link scrapers see).
export type PageMeta = { path: string; title: string; description: string }

export const SITE_URL: string = seo.siteUrl
export const PAGES: PageMeta[] = seo.pages

const byPath = new Map(PAGES.map((p) => [p.path, p]))
const home = PAGES.find((p) => p.path === "/")

const set = (selector: string, attr: string, value: string) =>
  document.head.querySelector(selector)?.setAttribute(attr, value)

// Keeps the head in sync across client-side navigation. The initial load is
// already correct: every route ships a prerendered HTML file carrying these
// same values, and unknown paths fall back to the shell, which this hook
// marks noindex.
export function usePageMeta(path: string) {
  useEffect(() => {
    const meta = byPath.get(path)
    const title = meta?.title ?? "Not found — kino"
    const description = meta?.description ?? home?.description ?? ""
    const url = SITE_URL + path
    document.title = title
    set('meta[name="description"]', "content", description)
    set('meta[name="robots"]', "content", meta ? "index,follow" : "noindex")
    set('link[rel="canonical"]', "href", url)
    set('meta[property="og:title"]', "content", title)
    set('meta[property="og:description"]', "content", description)
    set('meta[property="og:url"]', "content", url)
    set('meta[name="twitter:title"]', "content", title)
    set('meta[name="twitter:description"]', "content", description)
  }, [path])
}
