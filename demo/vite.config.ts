import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url))

// Single source of truth for the version badge: the package's own version.
const pkg = createRequire(import.meta.url)("../package.json") as {
  version: string
}

// Serves the visual harness in demo/. The published package is unaffected:
// nothing here lives under src/ or the files:["dist"] allowlist. Tailwind is a
// dev-only dependency of this demo and never ships with the library.
export default defineConfig({
  root: "demo",
  plugins: [react(), tailwindcss()],
  define: {
    __KINO_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // The dev server picks up any html under root, but a production build
    // only includes index.html unless every page is listed here. The scenes
    // fixture pages must survive the build or the deployed site's SPA
    // fallback would serve index.html in their place.
    rollupOptions: {
      input: {
        index: page("index"),
        scenes: page("scenes"),
        "scenes-host": page("scenes-host"),
      },
    },
  },
})
