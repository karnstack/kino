import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", mux: "src/mux.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
  // Copy the scoped stylesheet to dist/styles.css
  loader: { ".css": "copy" },
  onSuccess: "cp src/styles/kino.css dist/styles.css",
})
