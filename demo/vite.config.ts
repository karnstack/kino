import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Serves the visual harness in demo/. The published package is unaffected:
// nothing here lives under src/ or the files:["dist"] allowlist.
export default defineConfig({
  root: "demo",
  plugins: [react()],
})
