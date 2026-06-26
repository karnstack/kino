import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { createRequire } from "node:module"

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
})
