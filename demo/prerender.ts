// Post-build SEO pass over demo/dist, run by `pnpm build:demo`. The docs site
// is a SPA behind a single-page-application asset fallback, so without this
// every URL would serve the home page's head to crawlers and link scrapers
// that never execute JS. This stamps each route's title/description/OG tags
// from demo/seo.json into a static HTML copy per route (install.html,
// providers.html, … — the Worker's auto html_handling serves /install from
// install.html) and emits sitemap.xml. Runs on plain `node` via type
// stripping; keep it dependency-free.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

type Page = { path: string; title: string; description: string }

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, "dist")
const { siteUrl, pages } = JSON.parse(
  readFileSync(resolve(here, "seo.json"), "utf8"),
) as { siteUrl: string; pages: Page[] }

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

// Tags may be wrapped across lines by prettier, so patterns span whitespace
// within the tag rather than assuming one line.
const stamp = (
  html: string,
  pattern: RegExp,
  value: string,
  label: string,
): string => {
  if (!pattern.test(html))
    throw new Error(`prerender: ${label} not found in index.html`)
  return html.replace(pattern, `$1${value}$2`)
}

const template = readFileSync(resolve(dist, "index.html"), "utf8")

for (const page of pages) {
  const url = siteUrl + page.path
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  let html = template
  html = stamp(html, /(<title>)[^<]*(<\/title>)/, title, "title")
  html = stamp(
    html,
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    description,
    "meta description",
  )
  html = stamp(
    html,
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    url,
    "canonical",
  )
  html = stamp(
    html,
    /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
    title,
    "og:title",
  )
  html = stamp(
    html,
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    description,
    "og:description",
  )
  html = stamp(
    html,
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
    url,
    "og:url",
  )
  html = stamp(
    html,
    /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
    title,
    "twitter:title",
  )
  html = stamp(
    html,
    /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
    description,
    "twitter:description",
  )
  const out = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`
  writeFileSync(resolve(dist, out), html)
}

// The scenes demo page is real content with its own static HTML; list it
// alongside the SPA routes. The fixture host page stays out (it is noindex).
const urls = [...pages.map((p) => siteUrl + p.path), `${siteUrl}/scenes.html`]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`
writeFileSync(resolve(dist, "sitemap.xml"), sitemap)

console.log(`prerendered ${pages.length} routes + sitemap.xml -> ${dist}`)
