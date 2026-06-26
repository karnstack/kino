import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", mux: "src/mux.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  // type:module package → emit .js/.d.ts (not .mjs) to match package.json exports.
  fixedExtension: false,
  // react/react-dom (peer) and @mux/mux-video (dep) are externalized by default.
  // Ship the scoped stylesheet to dist/styles.css.
  copy: [{ from: "src/styles/kino.css", rename: "styles.css" }],
})
