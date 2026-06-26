# kino Video Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@karnstack/kino`, a premium themeable React video player with a pluggable-provider architecture (Mux first), then swap it into karnstack's lesson player.

**Architecture:** Three layers — a normalized media store (`useSyncExternalStore` + selector subscriptions), a Provider adapter that maps a concrete engine to that store, and a pure-React glass UI shell that reads state via selectors and calls provider actions. The Mux provider wraps the raw `<mux-video>` custom element (not `@mux/mux-video-react`, which lacks the renditions API and image-token props). Controls are capability-gated so providers that can't do a thing (iOS quality switching, custom-chrome fullscreen on iPhone) hide that control.

**Tech Stack:** React 19, TypeScript (strict), `tsup` build, Vitest + `@testing-library/react` + jsdom, `@mux/mux-video` (raw custom element), standalone CSS scoped under `.kino` with CSS-variable theming, Changesets for versioning. pnpm.

## Global Constraints

- **kino repo root:** `/Users/karn/code/karnstack/kino` (standalone public repo, sibling to the `karnstack` monorepo at `/Users/karn/code/karnstack/karnstack`). All kino paths below are relative to the kino repo root unless prefixed `MONOREPO:`.
- **Package name:** `@karnstack/kino`. Published public. MIT license.
- **No commercial-product references** (including the visual inspiration) anywhere in repo, docs, comments, or commit history. Describe the look only as "translucent glass / macOS-style".
- **No em dashes** in prose, copy, comments, or commit messages (monorepo convention; apply to kino too).
- **React is a peer dependency** (`react >=19`, `react-dom >=19`). Engine deps (`@mux/mux-video`) live only under the `/mux` subpath export.
- **Consumers must not need Tailwind.** Styles ship as one standalone `dist/styles.css` scoped under `.kino`; no global reset / preflight may leak onto the consumer page. Theming is via CSS custom properties.
- **Player is auth-agnostic.** Signed tokens are passed in as props; kino never mints tokens or touches Clerk.
- **Node 24, pnpm 10** (match the monorepo toolchain).

## Shared Type Contract

These types are defined in Task 2 (`src/core/types.ts`) and referenced verbatim by every later task. Reproduced here so any task can be read in isolation:

```ts
export type QualityLevel = {
  id: string // rendition id from the engine
  height: number // e.g. 1080
  bitrate: number // bits/sec
  selected: boolean // currently the pinned manual selection
}

export type TextTrackInfo = {
  id: string
  kind: string // "subtitles" | "captions" | ...
  label: string
  lang: string
  mode: "showing" | "hidden" | "disabled"
}

export type Capabilities = {
  canSetQuality: boolean
  hasStoryboard: boolean
  canPiP: boolean
  canFullscreen: boolean // custom-chrome fullscreen (false on iPhone)
  canSetRate: boolean
  hasTextTracks: boolean
}

export type MediaError = { code: number; message: string }

export type MediaState = {
  paused: boolean
  currentTime: number
  duration: number
  buffered: Array<[number, number]> // [start, end] seconds
  rate: number
  volume: number // 0..1
  muted: boolean
  readyState: number // HTMLMediaElement.readyState
  seeking: boolean
  ended: boolean
  error: MediaError | null
  qualities: QualityLevel[]
  activeQualityId: string | "auto"
  textTracks: TextTrackInfo[]
  activeTextTrackId: string | null
  fullscreen: boolean
  pip: boolean
  storyboard: { vttUrl: string } | null
  capabilities: Capabilities
}

export type PlayerActions = {
  play(): void
  pause(): void
  seek(time: number): void
  setRate(rate: number): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  setQuality(id: string | "auto"): void
  setTextTrack(id: string | null): void
  enterFullscreen(wrapper: HTMLElement): void
  exitFullscreen(): void
  enterPiP(): void
  exitPiP(): void
}

export interface Provider {
  mount(container: HTMLElement): void
  getState(): MediaState
  subscribe(listener: () => void): () => void
  actions: PlayerActions
  destroy(): void
}
```

## File Structure

```
kino/                                  (repo root /Users/karn/code/karnstack/kino)
  package.json                         exports map, peerDeps, scripts
  tsconfig.json  tsup.config.ts  vitest.config.ts  eslint.config.js  .prettierrc
  LICENSE  README.md  .changeset/
  src/
    index.ts                           core barrel: Player, usePlayer, hooks, types, theme
    mux.ts                             subpath barrel: MuxPlayer, createMuxProvider
    core/
      types.ts                         the Shared Type Contract above
      store.ts                         PlayerContext, useMediaSelector, usePlayer
      fake-provider.ts                 test double implementing Provider
    util/
      format-time.ts                   seconds -> "M:SS" / "H:MM:SS"
      storyboard.ts                    fetch + parse storyboard.vtt -> thumbnailAt(t)
      keymap.ts                        key event -> action name (pure)
    mux/
      provider.ts                      createMuxProvider over raw <mux-video>
      mux-video-element.ts             ensures the custom element is registered
      mux-player.tsx                   <MuxPlayer> styled drop-in
    ui/
      player.tsx                       <Player> root: layout, auto-hide, theme, keyboard
      control-bar.tsx                  play/pause, time, volume
      scrubber.tsx                     track, buffered, drag-seek, hover thumbnail
      idle-overlay.tsx                 hover-zoom play + speed pre-select bar
      popover.tsx                      glass popover primitive + keyboard badge
      menus.tsx                        Speed / Quality / Captions popovers
      buttons.tsx                      Fullscreen + PiP buttons
      icons.tsx                        inline SVG icon set
    styles/
      kino.css                         scoped .kino styles + CSS-var tokens
  demo/                                Vite playground (not published)
    index.html  main.tsx  vite.config.ts
```

---

### Task 1: Repo scaffold, tooling, and theme stylesheet

**Files:**

- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `LICENSE`, `README.md`
- Create: `src/index.ts`, `src/mux.ts`, `src/styles/kino.css`
- Create: `src/util/format-time.ts`, `src/util/format-time.test.ts`

**Interfaces:**

- Produces: a buildable/testable package; `formatTime(seconds: number): string`.

- [ ] **Step 1: Create the repo and pnpm package**

```bash
mkdir -p /Users/karn/code/karnstack/kino && cd /Users/karn/code/karnstack/kino
git init -q
```

Create `package.json`:

```json
{
  "name": "@karnstack/kino",
  "version": "0.0.1",
  "description": "Premium themeable React video player with pluggable providers.",
  "license": "MIT",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./mux": { "types": "./dist/mux.d.ts", "import": "./dist/mux.js" },
    "./styles.css": "./dist/styles.css"
  },
  "scripts": {
    "build": "tsup",
    "dev": "vite --config demo/vite.config.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "peerDependencies": { "react": ">=19", "react-dom": ">=19" },
  "dependencies": { "@mux/mux-video": "^0.31.0" },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.0.0",
    "jsdom": "^25.0.0",
    "prettier": "^3.3.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

Note: the Mux custom-element package is `@mux/mux-video` (scoped). The unscoped `mux-video` name is NOT published on npm. Version `0.31.0` is verified to define the `<mux-video>` element and expose the `videoRenditions` API. `tsup` keeps `dependencies` external by default, so `@mux/mux-video` is not bundled into `dist`.

- [ ] **Step 2: Config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "demo"]
}
```

`tsup.config.ts`:

```ts
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
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
})
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

`.prettierrc`: `{ "semi": false }`
`.gitignore`: `node_modules` and `dist` on separate lines.
`eslint.config.js`: a minimal flat config extending `@eslint/js` recommended + typescript-eslint recommended (add `typescript-eslint` and `@eslint/js` to devDependencies). Keep it lenient: warn on unused, allow `any` in `.test.ts`.
`LICENSE`: standard MIT, author "Karn", year 2026.

- [ ] **Step 3: Theme stylesheet** `src/styles/kino.css`

```css
.kino {
  /* theme tokens (overridable via inline style or a theme prop) */
  --kino-accent: oklch(50.8% 0.118 165.612);
  --kino-radius: 12px;
  --kino-surface: color-mix(in oklab, black 55%, transparent);
  --kino-surface-strong: color-mix(in oklab, black 70%, transparent);
  --kino-border: color-mix(in oklab, white 14%, transparent);
  --kino-text: oklch(98% 0 0);
  --kino-text-dim: color-mix(in oklab, white 65%, transparent);
  --kino-blur: 18px;
  --kino-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
  --kino-ease: cubic-bezier(0.22, 1, 0.36, 1);

  position: relative;
  width: 100%;
  height: 100%;
  color: var(--kino-text);
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: black;
  overflow: hidden;
}
.kino * {
  box-sizing: border-box;
}
.kino mux-video,
.kino video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.kino-glass {
  background: var(--kino-surface);
  backdrop-filter: blur(var(--kino-blur));
  -webkit-backdrop-filter: blur(var(--kino-blur));
  border: 1px solid var(--kino-border);
  border-radius: var(--kino-radius);
  box-shadow: var(--kino-shadow);
}
@media (prefers-reduced-motion: reduce) {
  .kino *,
  .kino *::before,
  .kino *::after {
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Write the failing test** `src/util/format-time.test.ts`

```ts
import { formatTime } from "./format-time"

test("formats seconds under a minute", () => {
  expect(formatTime(3)).toBe("0:03")
})
test("formats minutes and seconds", () => {
  expect(formatTime(68)).toBe("1:08")
})
test("formats hours", () => {
  expect(formatTime(3661)).toBe("1:01:01")
})
test("clamps NaN and negatives to 0:00", () => {
  expect(formatTime(NaN)).toBe("0:00")
  expect(formatTime(-5)).toBe("0:00")
})
```

- [ ] **Step 5: Run it, verify it fails**

Run: `pnpm install && pnpm test` — Expected: FAIL ("Cannot find module './format-time'").

- [ ] **Step 6: Implement** `src/util/format-time.ts`

```ts
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
```

- [ ] **Step 7: Stub barrels so build passes**

`src/index.ts`: `export { formatTime } from "./util/format-time"` and `export type * from "./core/types"` (add the types file empty-export for now or create in Task 2; if Task 2 not done, temporarily `export {}`). `src/mux.ts`: `export {}`.

- [ ] **Step 8: Verify green**

Run: `pnpm test && pnpm build` — Expected: tests PASS, `dist/index.js`, `dist/index.d.ts`, `dist/styles.css` emitted.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold @karnstack/kino package, tooling, theme css"
```

---

### Task 2: Core types and the player store

**Files:**

- Create: `src/core/types.ts` (the Shared Type Contract verbatim)
- Create: `src/core/fake-provider.ts`, `src/core/store.tsx`, `src/core/store.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `PlayerContext` (React context holding a `Provider`)
  - `usePlayer(): { state: MediaState; actions: PlayerActions }`
  - `useMediaSelector<T>(selector: (s: MediaState) => T, isEqual?): T`
  - `createFakeProvider(initial?: Partial<MediaState>): Provider & { set(patch: Partial<MediaState>): void }`

- [ ] **Step 1: Create `src/core/types.ts`** — paste the Shared Type Contract block from the top of this plan verbatim.

- [ ] **Step 2: Create the fake provider** `src/core/fake-provider.ts`

```ts
import type { MediaState, Provider, PlayerActions } from "./types"

const DEFAULT_CAPS = {
  canSetQuality: true,
  hasStoryboard: false,
  canPiP: true,
  canFullscreen: true,
  canSetRate: true,
  hasTextTracks: false,
}

export function defaultState(): MediaState {
  return {
    paused: true,
    currentTime: 0,
    duration: 0,
    buffered: [],
    rate: 1,
    volume: 1,
    muted: false,
    readyState: 0,
    seeking: false,
    ended: false,
    error: null,
    qualities: [],
    activeQualityId: "auto",
    textTracks: [],
    activeTextTrackId: null,
    fullscreen: false,
    pip: false,
    storyboard: null,
    capabilities: { ...DEFAULT_CAPS },
  }
}

export function createFakeProvider(initial?: Partial<MediaState>) {
  let state: MediaState = { ...defaultState(), ...initial }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const set = (patch: Partial<MediaState>) => {
    state = { ...state, ...patch }
    emit()
  }
  const actions: PlayerActions = {
    play: () => set({ paused: false }),
    pause: () => set({ paused: true }),
    seek: (t) => set({ currentTime: t }),
    setRate: (rate) => set({ rate }),
    setVolume: (v) => set({ volume: v }),
    setMuted: (m) => set({ muted: m }),
    setQuality: (id) => set({ activeQualityId: id }),
    setTextTrack: (id) => set({ activeTextTrackId: id }),
    enterFullscreen: () => set({ fullscreen: true }),
    exitFullscreen: () => set({ fullscreen: false }),
    enterPiP: () => set({ pip: true }),
    exitPiP: () => set({ pip: false }),
  }
  const provider: Provider = {
    mount: () => {},
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    actions,
    destroy: () => listeners.clear(),
  }
  return Object.assign(provider, { set })
}
```

- [ ] **Step 3: Write the failing test** `src/core/store.test.tsx`

```tsx
import { render, screen, act } from "@testing-library/react"
import { PlayerContext, useMediaSelector, usePlayer } from "./store"
import { createFakeProvider } from "./fake-provider"

function Time() {
  const t = useMediaSelector((s) => s.currentTime)
  return <span data-testid="t">{t}</span>
}

test("useMediaSelector re-renders only when the selected slice changes", () => {
  const provider = createFakeProvider()
  let renders = 0
  function Counted() {
    renders++
    const paused = useMediaSelector((s) => s.paused)
    return <span data-testid="p">{String(paused)}</span>
  }
  render(
    <PlayerContext.Provider value={provider}>
      <Counted />
    </PlayerContext.Provider>,
  )
  const before = renders
  act(() => provider.set({ currentTime: 5 })) // unrelated slice
  expect(renders).toBe(before) // no re-render
  act(() => provider.set({ paused: false }))
  expect(screen.getByTestId("p").textContent).toBe("false")
})

test("usePlayer exposes actions that drive state", () => {
  const provider = createFakeProvider()
  function Btn() {
    const { actions } = usePlayer()
    return <button onClick={() => actions.seek(9)}>seek</button>
  }
  render(
    <PlayerContext.Provider value={provider}>
      <Btn />
      <Time />
    </PlayerContext.Provider>,
  )
  act(() => screen.getByText("seek").click())
  expect(screen.getByTestId("t").textContent).toBe("9")
})
```

- [ ] **Step 4: Run it, verify it fails** — Run: `pnpm test src/core/store.test.tsx` — Expected: FAIL ("Cannot find module './store'").

- [ ] **Step 5: Implement** `src/core/store.tsx`

```tsx
import { createContext, useContext, useRef, useSyncExternalStore } from "react"
import type { MediaState, PlayerActions, Provider } from "./types"

export const PlayerContext = createContext<Provider | null>(null)

function useProvider(): Provider {
  const p = useContext(PlayerContext)
  if (!p) throw new Error("kino: components must render inside <Player>")
  return p
}

export function useMediaSelector<T>(
  selector: (s: MediaState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const provider = useProvider()
  const cache = useRef<{ has: boolean; value: T }>({
    has: false,
    value: undefined as never,
  })
  const getSnapshot = () => {
    const next = selector(provider.getState())
    if (cache.current.has && isEqual(cache.current.value, next))
      return cache.current.value
    cache.current = { has: true, value: next }
    return next
  }
  return useSyncExternalStore(provider.subscribe, getSnapshot, getSnapshot)
}

export function usePlayer(): { state: MediaState; actions: PlayerActions } {
  const provider = useProvider()
  const state = useMediaSelector((s) => s)
  return { state, actions: provider.actions }
}
```

- [ ] **Step 6: Run tests, verify pass** — Run: `pnpm test src/core/store.test.tsx` — Expected: PASS (both tests).

- [ ] **Step 7: Export from barrel** — `src/index.ts` add:

```ts
export type * from "./core/types"
export { PlayerContext, usePlayer, useMediaSelector } from "./core/store"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: core media types, fake provider, selector store"
```

---

### Task 3: Storyboard VTT parser

**Files:**

- Create: `src/util/storyboard.ts`, `src/util/storyboard.test.ts`

**Interfaces:**

- Produces:
  - `parseStoryboard(vttText: string, baseUrl: string): Storyboard`
  - `type Storyboard = { tiles: Tile[]; thumbnailAt(time: number): Tile | null }`
  - `type Tile = { url: string; x: number; y: number; w: number; h: number; start: number; end: number }`

- [ ] **Step 1: Write the failing test** `src/util/storyboard.test.ts`

```ts
import { parseStoryboard } from "./storyboard"

const SAMPLE = `WEBVTT

00:00:00.000 --> 00:00:05.000
storyboard.jpg#xywh=0,0,320,180

00:00:05.000 --> 00:00:10.000
storyboard.jpg#xywh=320,0,320,180
`

test("parses cues into tiles with xywh and time ranges", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.tiles).toHaveLength(2)
  expect(sb.tiles[0]).toMatchObject({
    url: "https://image.mux.com/ID/storyboard.jpg",
    x: 0,
    y: 0,
    w: 320,
    h: 180,
    start: 0,
    end: 5,
  })
  expect(sb.tiles[1].x).toBe(320)
})

test("thumbnailAt returns the tile covering the time", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.thumbnailAt(2)?.x).toBe(0)
  expect(sb.thumbnailAt(7)?.x).toBe(320)
})

test("thumbnailAt clamps past the end to the last tile", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.thumbnailAt(999)?.x).toBe(320)
})

test("returns empty storyboard for blank input", () => {
  expect(parseStoryboard("WEBVTT\n", "x").tiles).toHaveLength(0)
  expect(parseStoryboard("WEBVTT\n", "x").thumbnailAt(1)).toBeNull()
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/util/storyboard.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/util/storyboard.ts`

```ts
export type Tile = {
  url: string
  x: number
  y: number
  w: number
  h: number
  start: number
  end: number
}
export type Storyboard = {
  tiles: Tile[]
  thumbnailAt(time: number): Tile | null
}

function toSeconds(stamp: string): number {
  // hh:mm:ss.mmm or mm:ss.mmm
  const parts = stamp.trim().split(":").map(Number)
  let s = 0
  for (const p of parts) s = s * 60 + p
  return s
}

export function parseStoryboard(vttText: string, baseUrl: string): Storyboard {
  const lines = vttText.split(/\r?\n/)
  const tiles: Tile[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.includes("-->")) continue
    const [from, to] = line.split("-->")
    const start = toSeconds(from)
    const end = toSeconds(to)
    const payload = (lines[i + 1] ?? "").trim()
    const m = payload.match(/^(.*?)#xywh=(\d+),(\d+),(\d+),(\d+)/)
    if (!m) continue
    const [, file, x, y, w, h] = m
    tiles.push({
      url: new URL(file, baseUrl).href,
      x: +x,
      y: +y,
      w: +w,
      h: +h,
      start,
      end,
    })
  }
  return {
    tiles,
    thumbnailAt(time: number) {
      if (tiles.length === 0) return null
      for (const t of tiles) if (time >= t.start && time < t.end) return t
      return tiles[tiles.length - 1] ?? null
    },
  }
}
```

- [ ] **Step 4: Run tests, verify pass** — Run: `pnpm test src/util/storyboard.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: storyboard vtt parser with tile lookup"
```

---

### Task 4: Keyboard map

**Files:**

- Create: `src/util/keymap.ts`, `src/util/keymap.test.ts`

**Interfaces:**

- Produces: `resolveKey(e: KeyboardEvent): KeyAction | null` and `type KeyAction` (a discriminated union below). Plus `isTypingTarget(el: EventTarget | null): boolean`.

- [ ] **Step 1: Write the failing test** `src/util/keymap.test.ts`

```ts
import { resolveKey, isTypingTarget } from "./keymap"

const ev = (init: Partial<KeyboardEvent>) => init as unknown as KeyboardEvent

test("space toggles play", () => {
  expect(resolveKey(ev({ key: " " }))).toEqual({ type: "toggle-play" })
})
test("arrows seek and adjust volume", () => {
  expect(resolveKey(ev({ key: "ArrowRight" }))).toEqual({
    type: "seek-by",
    delta: 5,
  })
  expect(resolveKey(ev({ key: "ArrowLeft" }))).toEqual({
    type: "seek-by",
    delta: -5,
  })
  expect(resolveKey(ev({ key: "ArrowUp" }))).toEqual({
    type: "volume-by",
    delta: 0.1,
  })
})
test("letters map to feature toggles", () => {
  expect(resolveKey(ev({ key: "f" }))).toEqual({ type: "toggle-fullscreen" })
  expect(resolveKey(ev({ key: "m" }))).toEqual({ type: "toggle-mute" })
  expect(resolveKey(ev({ key: "c" }))).toEqual({ type: "toggle-captions" })
  expect(resolveKey(ev({ key: "s" }))).toEqual({ type: "open-speed" })
})
test("digits seek to percent", () => {
  expect(resolveKey(ev({ key: "5" }))).toEqual({
    type: "seek-percent",
    percent: 50,
  })
})
test("modifier keys are ignored", () => {
  expect(resolveKey(ev({ key: " ", metaKey: true }))).toBeNull()
})
test("isTypingTarget guards inputs", () => {
  const input = document.createElement("input")
  expect(isTypingTarget(input)).toBe(true)
  expect(isTypingTarget(document.createElement("div"))).toBe(false)
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/util/keymap.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/util/keymap.ts`

```ts
export type KeyAction =
  | { type: "toggle-play" }
  | { type: "seek-by"; delta: number }
  | { type: "volume-by"; delta: number }
  | { type: "toggle-fullscreen" }
  | { type: "toggle-mute" }
  | { type: "toggle-captions" }
  | { type: "open-speed" }
  | { type: "rate-by"; delta: number }
  | { type: "seek-percent"; percent: number }

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  )
}

export function resolveKey(e: KeyboardEvent): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case " ":
    case "k":
      return { type: "toggle-play" }
    case "ArrowRight":
      return { type: "seek-by", delta: 5 }
    case "ArrowLeft":
      return { type: "seek-by", delta: -5 }
    case "ArrowUp":
      return { type: "volume-by", delta: 0.1 }
    case "ArrowDown":
      return { type: "volume-by", delta: -0.1 }
    case "f":
      return { type: "toggle-fullscreen" }
    case "m":
      return { type: "toggle-mute" }
    case "c":
      return { type: "toggle-captions" }
    case "s":
      return { type: "open-speed" }
    case "<":
      return { type: "rate-by", delta: -0.25 }
    case ">":
      return { type: "rate-by", delta: 0.25 }
  }
  if (/^[0-9]$/.test(e.key))
    return { type: "seek-percent", percent: Number(e.key) * 10 }
  return null
}
```

- [ ] **Step 4: Run tests, verify pass** — Run: `pnpm test src/util/keymap.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: keyboard action map"
```

---

### Task 5: Mux provider over raw `<mux-video>`

**Files:**

- Create: `src/mux/mux-video-element.ts` (registers the custom element)
- Create: `src/mux/urls.ts`, `src/mux/urls.test.ts` (pure helpers, jsdom-unit-tested WITHOUT importing the element)
- Create: `src/mux/provider.ts` (imports the element + helpers; its element behavior is verified in the demo at Task 11, NOT in a jsdom unit test, so no test imports `provider.ts`)

**CRITICAL:** Importing `@mux/mux-video` pulls browser-only playback code that is unreliable under jsdom. Therefore NO vitest test file may import `provider.ts` (which top-imports the element). Pure logic is extracted to `urls.ts` and tested there. The provider's element wiring is exercised only by the Vite demo (Task 11).

**Interfaces:**

- Consumes: types from Task 2; `parseStoryboard` (Task 3, used later by scrubber, not here).
- Produces:
  - `createMuxProvider(opts: MuxProviderOptions): Provider` (in `provider.ts`)
  - `type MuxProviderOptions = { playbackId: string; tokens?: { playback?: string; thumbnail?: string; storyboard?: string }; metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }; envKey?: string; poster?: string; autoPlay?: boolean; defaultRate?: number }`
  - `buildImageUrl(playbackId, kind: "storyboard" | "thumbnail", token?, ext?): string` (in `urls.ts`)
  - `detectIOS(ua: string): boolean` (in `urls.ts`)

- [ ] **Step 1: Element registration** `src/mux/mux-video-element.ts`

```ts
// Importing this module registers <mux-video> as a custom element (side effect).
import "@mux/mux-video"
```

- [ ] **Step 2: Write the failing test** `src/mux/urls.test.ts`

```ts
import { buildImageUrl, detectIOS } from "./urls"

test("buildImageUrl composes signed storyboard url", () => {
  expect(buildImageUrl("ID", "storyboard", "JWT")).toBe(
    "https://image.mux.com/ID/storyboard.vtt?token=JWT",
  )
})
test("buildImageUrl omits token when unsigned", () => {
  expect(buildImageUrl("ID", "thumbnail")).toBe(
    "https://image.mux.com/ID/thumbnail.webp",
  )
})
test("detectIOS true for iPhone UA, false for desktop", () => {
  expect(
    detectIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
  ).toBe(true)
  expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe(false)
})
```

- [ ] **Step 3: Run it, verify it fails** — Run: `pnpm test src/mux/urls.test.ts` — Expected: FAIL ("Cannot find module './urls'").

- [ ] **Step 4a: Implement the pure helpers** `src/mux/urls.ts`

```ts
const IMAGE_HOST = "https://image.mux.com"

export function buildImageUrl(
  playbackId: string,
  kind: "storyboard" | "thumbnail",
  token?: string,
  ext = kind === "storyboard" ? "vtt" : "webp",
): string {
  const base = `${IMAGE_HOST}/${playbackId}/${kind}.${ext}`
  return token ? `${base}?token=${token}` : base
}

export function detectIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/.test(ua)
}
```

Run: `pnpm test src/mux/urls.test.ts` — Expected: PASS.

- [ ] **Step 4b: Implement the provider** `src/mux/provider.ts`

```ts
import "./mux-video-element"
import { defaultState } from "../core/fake-provider"
import { buildImageUrl, detectIOS } from "./urls"
import type {
  MediaState,
  Provider,
  PlayerActions,
  QualityLevel,
  TextTrackInfo,
} from "../core/types"

export type MuxProviderOptions = {
  playbackId: string
  tokens?: { playback?: string; thumbnail?: string; storyboard?: string }
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  envKey?: string
  poster?: string
  autoPlay?: boolean
  defaultRate?: number
}

// Minimal structural type of the mux-video element we touch.
type MuxVideoEl = HTMLVideoElement & {
  playbackId?: string
  metadata?: Record<string, unknown>
  envKey?: string
  videoRenditions?: {
    length: number
    selectedIndex: number
    [i: number]: {
      id: string
      height: number
      bitrate: number
      selected: boolean
    }
    addEventListener(t: string, cb: () => void): void
    removeEventListener(t: string, cb: () => void): void
  }
}

export function createMuxProvider(opts: MuxProviderOptions): Provider {
  const ios = typeof navigator !== "undefined" && detectIOS(navigator.userAgent)
  let el: MuxVideoEl | null = null
  let state: MediaState = {
    ...defaultState(),
    rate: opts.defaultRate ?? 1,
    storyboard: {
      vttUrl: buildImageUrl(
        opts.playbackId,
        "storyboard",
        opts.tokens?.storyboard,
      ),
    },
    capabilities: {
      canSetQuality: !ios,
      hasStoryboard: true,
      canPiP:
        typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document,
      canFullscreen: !ios,
      canSetRate: true,
      hasTextTracks: true,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }

  const readQualities = (): QualityLevel[] => {
    const r = el?.videoRenditions
    if (!r) return []
    const out: QualityLevel[] = []
    for (let i = 0; i < r.length; i++) {
      const item = r[i]
      out.push({
        id: item.id,
        height: item.height,
        bitrate: item.bitrate,
        selected: item.selected,
      })
    }
    return out
  }
  const readTextTracks = (): TextTrackInfo[] => {
    const tt = el?.textTracks
    if (!tt) return []
    const out: TextTrackInfo[] = []
    for (let i = 0; i < tt.length; i++) {
      const t = tt[i]
      if (t.kind !== "subtitles" && t.kind !== "captions") continue
      out.push({
        id: t.id || String(i),
        kind: t.kind,
        label: t.label,
        lang: t.language,
        mode: t.mode,
      })
    }
    return out
  }
  const syncFromEl = () => {
    if (!el) return
    const ranges: Array<[number, number]> = []
    for (let i = 0; i < el.buffered.length; i++)
      ranges.push([el.buffered.start(i), el.buffered.end(i)])
    patch({
      paused: el.paused,
      currentTime: el.currentTime,
      duration: el.duration || 0,
      buffered: ranges,
      rate: el.playbackRate,
      volume: el.volume,
      muted: el.muted,
      readyState: el.readyState,
      seeking: el.seeking,
      ended: el.ended,
      qualities: readQualities(),
      textTracks: readTextTracks(),
    })
  }

  const MEDIA_EVENTS = [
    "play",
    "pause",
    "timeupdate",
    "durationchange",
    "progress",
    "volumechange",
    "ratechange",
    "seeking",
    "seeked",
    "ended",
    "loadedmetadata",
    "canplay",
    "waiting",
    "error",
  ]

  const actions: PlayerActions = {
    play: () => {
      void el?.play?.()
    },
    pause: () => el?.pause(),
    seek: (t) => {
      if (el) el.currentTime = t
    },
    setRate: (r) => {
      if (el) el.playbackRate = r
    },
    setVolume: (v) => {
      if (el) el.volume = Math.min(1, Math.max(0, v))
    },
    setMuted: (m) => {
      if (el) el.muted = m
    },
    setQuality: (id) => {
      const r = el?.videoRenditions
      if (!r) return
      if (id === "auto") {
        r.selectedIndex = -1
        patch({ activeQualityId: "auto" })
        return
      }
      for (let i = 0; i < r.length; i++)
        if (r[i].id === id) {
          r[i].selected = true
          r.selectedIndex = i
        }
      patch({ activeQualityId: id })
    },
    setTextTrack: (id) => {
      const tt = el?.textTracks
      if (!tt) return
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i]
        if (t.kind !== "subtitles" && t.kind !== "captions") continue
        t.mode = (t.id || String(i)) === id ? "showing" : "disabled"
      }
      patch({ activeTextTrackId: id })
    },
    enterFullscreen: (wrapper) => {
      void wrapper.requestFullscreen?.()
    },
    exitFullscreen: () => {
      void document.exitFullscreen?.()
    },
    enterPiP: () => {
      void el?.requestPictureInPicture?.()
    },
    exitPiP: () => {
      void document.exitPictureInPicture?.()
    },
  }

  return {
    mount(container) {
      el = document.createElement("mux-video") as MuxVideoEl
      el.playbackId = opts.tokens?.playback
        ? `${opts.playbackId}?token=${opts.tokens.playback}`
        : opts.playbackId
      el.setAttribute("crossorigin", "")
      if (opts.poster) el.poster = opts.poster
      if (opts.autoPlay) el.autoplay = true
      el.playbackRate = state.rate
      if (opts.envKey) el.envKey = opts.envKey
      if (opts.metadata) {
        el.metadata = {
          video_id: opts.metadata.videoId,
          video_title: opts.metadata.videoTitle,
          viewer_user_id: opts.metadata.viewerUserId,
        }
      }
      for (const ev of MEDIA_EVENTS) el.addEventListener(ev, syncFromEl)
      el.videoRenditions?.addEventListener("change", syncFromEl)
      document.addEventListener("fullscreenchange", () =>
        patch({ fullscreen: document.fullscreenElement != null }),
      )
      el.addEventListener("enterpictureinpicture", () => patch({ pip: true }))
      el.addEventListener("leavepictureinpicture", () => patch({ pip: false }))
      container.appendChild(el)
    },
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    actions,
    destroy() {
      if (el) {
        for (const ev of MEDIA_EVENTS) el.removeEventListener(ev, syncFromEl)
        el.remove()
      }
      el = null
      listeners.clear()
    },
  }
}
```

- [ ] **Step 5: Typecheck the provider** — Run: `pnpm typecheck` — Expected: PASS. (Pure logic is already covered by `src/mux/urls.test.ts` in Step 4a; the element wiring in `provider.ts` is verified in the demo at Task 11. Do NOT add a vitest file that imports `provider.ts` — it would load `@mux/mux-video` under jsdom and is brittle.)

- [ ] **Step 6: Export from `/mux` barrel** — `src/mux.ts`: `export { createMuxProvider, type MuxProviderOptions } from "./mux/provider"` (the `<MuxPlayer>` component is added in Task 11).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: mux provider over raw mux-video element"
```

---

### Task 6: Player root (layout, theme, auto-hide, keyboard)

**Files:**

- Create: `src/ui/icons.tsx` (inline SVGs: Play, Pause, Volume, VolumeMuted, Cc, Settings, Pip, Fullscreen, FullscreenExit, Gauge)
- Create: `src/ui/player.tsx`, `src/ui/player.test.tsx`

**Interfaces:**

- Consumes: `PlayerContext`, `useMediaSelector`, `usePlayer` (Task 2); `resolveKey`, `isTypingTarget` (Task 4).
- Produces:
  - `<Player>` component: `{ provider: Provider; accentColor?: string; theme?: Record<string,string>; className?: string; children?: ReactNode }`
  - `Player.Overlay` slot component (renders children above the video, below the chrome).
  - `useControlsVisible(): boolean` (hook used by chrome to fade).
  - Mounts the provider into a wrapper `div.kino`, applies theme CSS vars, wires the keyboard handler, and exposes the wrapper element via context for fullscreen.

- [ ] **Step 1: Create `src/ui/icons.tsx`** — export small functional components returning `<svg>` with `currentColor` fills, 24x24, `aria-hidden`. (Standard inline SVG paths for each icon listed above.)

- [ ] **Step 2: Write the failing test** `src/ui/player.test.tsx`

```tsx
import { render, screen, act, fireEvent } from "@testing-library/react"
import { Player } from "./player"
import { createFakeProvider } from "../core/fake-provider"

test("renders children overlay and applies accent var", () => {
  const provider = createFakeProvider()
  const { container } = render(
    <Player provider={provider} accentColor="rgb(1,2,3)">
      <Player.Overlay>
        <span>hi</span>
      </Player.Overlay>
    </Player>,
  )
  expect(screen.getByText("hi")).toBeInTheDocument()
  const root = container.querySelector(".kino") as HTMLElement
  expect(root.style.getPropertyValue("--kino-accent")).toBe("rgb(1,2,3)")
})

test("space toggles playback via keyboard", () => {
  const provider = createFakeProvider({ paused: true })
  const { container } = render(<Player provider={provider} />)
  const root = container.querySelector(".kino") as HTMLElement
  act(() => {
    fireEvent.keyDown(root, { key: " " })
  })
  expect(provider.getState().paused).toBe(false)
})
```

- [ ] **Step 3: Run it, verify it fails** — Run: `pnpm test src/ui/player.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implement** `src/ui/player.tsx`

```tsx
import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { PlayerContext, usePlayer } from "../core/store"
import { resolveKey, isTypingTarget } from "../util/keymap"
import type { Provider } from "../core/types"

const WrapperContext =
  createContext<React.RefObject<HTMLDivElement | null> | null>(null)
export const useWrapperRef = () => useContext(WrapperContext)

type PlayerProps = {
  provider: Provider
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  children?: ReactNode
}

export function Player({
  provider,
  accentColor,
  theme,
  className,
  children,
}: PlayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const videoHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = videoHostRef.current
    if (!host) return
    provider.mount(host)
    return () => provider.destroy()
  }, [provider])

  const style: React.CSSProperties = { ...(theme as React.CSSProperties) }
  if (accentColor)
    (style as Record<string, string>)["--kino-accent"] = accentColor

  return (
    <PlayerContext.Provider value={provider}>
      <WrapperContext.Provider value={wrapperRef}>
        <div
          ref={wrapperRef}
          className={["kino", className].filter(Boolean).join(" ")}
          style={style}
          tabIndex={0}
        >
          <div ref={videoHostRef} className="kino-video-host" />
          {children}
        </div>
      </WrapperContext.Provider>
    </PlayerContext.Provider>
  )
}

function KeyboardLayer() {
  // Rendered by <Player> so it can use provider context; attaches to wrapper.
  return null
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="kino-overlay">{children}</div>
}
Player.Overlay = Overlay

export function useControlsVisible(): boolean {
  const [visible, setVisible] = useState(true)
  const wrapperRef = useWrapperRef()
  const { state } = usePlayer()
  useEffect(() => {
    const root = wrapperRef?.current
    if (!root) return
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      setVisible(true)
      clearTimeout(timer)
      if (!state.paused) timer = setTimeout(() => setVisible(false), 2500)
    }
    root.addEventListener("pointermove", show)
    root.addEventListener("focusin", show)
    show()
    return () => {
      clearTimeout(timer)
      root.removeEventListener("pointermove", show)
      root.removeEventListener("focusin", show)
    }
  }, [wrapperRef, state.paused])
  return visible || state.paused
}
```

Then wire the keyboard handler inside `Player` (add to the same file, invoked from the wrapper `onKeyDown`):

```tsx
// add to PlayerProps usage: onKeyDown on the wrapper div
// inside Player component body:
const { actions, state } = usePlayer is NOT available here (Player provides the context),
// so implement the handler reading provider directly:
function handleKeyDown(e: React.KeyboardEvent) {
  if (isTypingTarget(e.target)) return
  const action = resolveKey(e.nativeEvent)
  if (!action) return
  e.preventDefault()
  const s = provider.getState()
  const a = provider.actions
  switch (action.type) {
    case "toggle-play": s.paused ? a.play() : a.pause(); break
    case "seek-by": a.seek(Math.max(0, s.currentTime + action.delta)); break
    case "volume-by": a.setVolume(s.volume + action.delta); break
    case "toggle-mute": a.setMuted(!s.muted); break
    case "toggle-fullscreen":
      if (s.fullscreen) a.exitFullscreen()
      else if (wrapperRef.current) a.enterFullscreen(wrapperRef.current)
      break
    case "seek-percent": if (s.duration) a.seek((action.percent / 100) * s.duration); break
    case "rate-by": a.setRate(Math.max(0.25, s.rate + action.delta)); break
    case "toggle-captions": {
      const next = s.activeTextTrackId ? null : s.textTracks[0]?.id ?? null
      a.setTextTrack(next); break
    }
    case "open-speed": /* handled by menus via a shared event; no-op here for v0.0.1 */ break
  }
}
// attach: <div ... onKeyDown={handleKeyDown}>
```

(Note for the implementer: put `handleKeyDown` inside the component body so it closes over `provider` and `wrapperRef`, and remove the placeholder `KeyboardLayer`. The `open-speed` shortcut focus is delivered in Task 9 where menus mount.)

- [ ] **Step 5: Run tests, verify pass** — Run: `pnpm test src/ui/player.test.tsx` — Expected: PASS.

- [ ] **Step 6: Export** — `src/index.ts` add `export { Player, useControlsVisible } from "./ui/player"`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: player root with theme, overlay slot, keyboard"
```

---

### Task 7: Scrubber with buffered shading, drag-seek, and hover thumbnail

**Files:**

- Create: `src/ui/scrubber.tsx`, `src/ui/scrubber.test.tsx`

**Interfaces:**

- Consumes: `useMediaSelector`, `usePlayer` (Task 2), `parseStoryboard` (Task 3), `formatTime` (Task 1).
- Produces: `<Scrubber />` (no props; reads everything from context).

- [ ] **Step 1: Write the failing test** `src/ui/scrubber.test.tsx`

```tsx
import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { Scrubber } from "./scrubber"

test("renders progress fill proportional to currentTime/duration", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 25 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
  )
  const fill = screen.getByTestId("kino-progress")
  expect(fill.style.width).toBe("25%")
})

test("clicking the track seeks", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
  )
  const track = screen.getByTestId("kino-track")
  // jsdom has no layout; stub getBoundingClientRect
  track.getBoundingClientRect = () => ({
    left: 0,
    width: 200,
    top: 0,
    height: 4,
    right: 200,
    bottom: 4,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  act(() => {
    track.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, bubbles: true }),
    )
  })
  expect(provider.getState().currentTime).toBe(50)
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/ui/scrubber.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/ui/scrubber.tsx`

```tsx
import { useEffect, useRef, useState } from "react"
import { useMediaSelector, usePlayer } from "../core/store"
import { parseStoryboard, type Storyboard } from "../util/storyboard"
import { formatTime } from "../util/format-time"

export function Scrubber() {
  const { actions } = usePlayer()
  const duration = useMediaSelector((s) => s.duration)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const buffered = useMediaSelector((s) => s.buffered)
  const storyboardUrl = useMediaSelector((s) => s.storyboard?.vttUrl ?? null)
  const hasStoryboard = useMediaSelector((s) => s.capabilities.hasStoryboard)

  const trackRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null)
  const [sb, setSb] = useState<Storyboard | null>(null)

  useEffect(() => {
    if (!hasStoryboard || !storyboardUrl) return
    let alive = true
    fetch(storyboardUrl)
      .then((r) => r.text())
      .then((txt) => {
        if (alive) setSb(parseStoryboard(txt, storyboardUrl))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [hasStoryboard, storyboardUrl])

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const timeFromClientX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const t = timeFromClientX(e.clientX)
    actions.seek(t)
    const move = (ev: PointerEvent) => actions.seek(timeFromClientX(ev.clientX))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect()
    setHover({ x: e.clientX - rect.left, time: timeFromClientX(e.clientX) })
  }
  const tile = sb && hover ? sb.thumbnailAt(hover.time) : null

  return (
    <div
      className="kino-scrubber"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
    >
      {hover && (
        <div className="kino-preview" style={{ left: hover.x }}>
          {tile && (
            <div
              className="kino-preview-img"
              style={{
                width: tile.w,
                height: tile.h,
                backgroundImage: `url(${tile.url})`,
                backgroundPosition: `-${tile.x}px -${tile.y}px`,
              }}
            />
          )}
          <span className="kino-preview-time">{formatTime(hover.time)}</span>
        </div>
      )}
      <div
        ref={trackRef}
        data-testid="kino-track"
        className="kino-track"
        onPointerDown={onPointerDown}
      >
        {buffered.map(([s, e], i) => (
          <div
            key={i}
            className="kino-buffered"
            style={{
              left: `${duration ? (s / duration) * 100 : 0}%`,
              width: `${duration ? ((e - s) / duration) * 100 : 0}%`,
            }}
          />
        ))}
        <div
          data-testid="kino-progress"
          className="kino-progress"
          style={{ width: `${pct}%` }}
        />
        <div className="kino-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}
```

Add matching styles to `src/styles/kino.css` (track height, accent fill via `var(--kino-accent)`, `.kino-preview` glass card positioned above the track, `.kino-buffered` faint white). Keep additions scoped under `.kino`.

- [ ] **Step 4: Run tests, verify pass** — Run: `pnpm test src/ui/scrubber.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scrubber with buffered shading, drag-seek, storyboard preview"
```

---

### Task 8: Idle overlay (hover-zoom play + speed pre-select)

**Files:**

- Create: `src/ui/idle-overlay.tsx`, `src/ui/idle-overlay.test.tsx`

**Interfaces:**

- Consumes: `useMediaSelector`, `usePlayer`.
- Produces: `<IdleOverlay />` — shown only while `currentTime === 0 && paused && !ended`.

- [ ] **Step 1: Write the failing test** `src/ui/idle-overlay.test.tsx`

```tsx
import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { IdleOverlay } from "./idle-overlay"

test("shows speed options and starts playback at chosen rate", () => {
  const provider = createFakeProvider({ paused: true, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <IdleOverlay />
    </PlayerContext.Provider>,
  )
  act(() => screen.getByRole("button", { name: "1.5x" }).click())
  expect(provider.getState().rate).toBe(1.5)
  expect(provider.getState().paused).toBe(false)
})

test("hidden once playback has progressed", () => {
  const provider = createFakeProvider({ paused: false, currentTime: 12 })
  render(
    <PlayerContext.Provider value={provider}>
      <IdleOverlay />
    </PlayerContext.Provider>,
  )
  expect(screen.queryByLabelText("Play")).toBeNull()
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/ui/idle-overlay.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/ui/idle-overlay.tsx`

```tsx
import { useMediaSelector, usePlayer } from "../core/store"
import { PlayIcon } from "./icons"

const SPEEDS: Array<{ label: string; rate: number }> = [
  { label: "0.8x", rate: 0.8 },
  { label: "1x", rate: 1 },
  { label: "1.2x", rate: 1.2 },
  { label: "1.5x", rate: 1.5 },
  { label: "1.7x", rate: 1.7 },
  { label: "2x", rate: 2 },
  { label: "Max", rate: 2.5 },
]

export function IdleOverlay() {
  const { actions } = usePlayer()
  const paused = useMediaSelector((s) => s.paused)
  const currentTime = useMediaSelector((s) => s.currentTime)
  const ended = useMediaSelector((s) => s.ended)
  if (!paused || currentTime > 0 || ended) return null

  const startAt = (rate: number) => {
    actions.setRate(rate)
    actions.play()
  }

  return (
    <div className="kino-idle">
      <button
        className="kino-idle-play"
        aria-label="Play"
        onClick={() => actions.play()}
      >
        <PlayIcon />
      </button>
      <div className="kino-idle-speeds kino-glass">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            className="kino-speed-chip"
            onClick={() => startAt(s.rate)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

Add styles: `.kino-idle-play` centered, scales `transform: scale(1.08)` on `:hover` with `transition: transform .2s var(--kino-ease)`; `.kino-idle-speeds` row that fades/translates in when `.kino-idle:hover` (opacity 0 -> 1).

- [ ] **Step 4: Run tests, verify pass** — Run: `pnpm test src/ui/idle-overlay.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: idle overlay with hover-zoom play and speed pre-select"
```

---

### Task 9: Popover primitive and Speed/Quality/Captions menus

**Files:**

- Create: `src/ui/popover.tsx`, `src/ui/menus.tsx`, `src/ui/menus.test.tsx`

**Interfaces:**

- Consumes: `useMediaSelector`, `usePlayer`.
- Produces:
  - `<Popover trigger={ReactNode} shortcut?: string>{children}</Popover>` — snappy glass popover; `shortcut` renders a keyboard badge in the trigger tooltip.
  - `<SpeedMenu />`, `<QualityMenu />`, `<CaptionsMenu />` — each capability-gated (render null if the capability is off).

- [ ] **Step 1: Write the failing test** `src/ui/menus.test.tsx`

```tsx
import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { SpeedMenu, QualityMenu } from "./menus"

test("speed menu sets rate", () => {
  const provider = createFakeProvider({ rate: 1 })
  render(
    <PlayerContext.Provider value={provider}>
      <SpeedMenu />
    </PlayerContext.Provider>,
  )
  act(() => screen.getByRole("button", { name: /1x speed/i }).click()) // open
  act(() => screen.getByRole("menuitemradio", { name: "1.5x" }).click())
  expect(provider.getState().rate).toBe(1.5)
})

test("quality menu hidden when capability is off", () => {
  const provider = createFakeProvider()
  provider.set({
    capabilities: { ...provider.getState().capabilities, canSetQuality: false },
  })
  const { container } = render(
    <PlayerContext.Provider value={provider}>
      <QualityMenu />
    </PlayerContext.Provider>,
  )
  expect(container.firstChild).toBeNull()
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/ui/menus.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/popover.tsx`**

```tsx
import { useState, type ReactNode } from "react"

export function Popover({
  trigger,
  shortcut,
  label,
  children,
}: {
  trigger: ReactNode
  shortcut?: string
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="kino-popover-root" onPointerLeave={() => setOpen(false)}>
      <button
        className="kino-ctrl"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {!open && shortcut && (
        <span className="kino-tip kino-glass">
          {label}
          <kbd>{shortcut}</kbd>
        </span>
      )}
      {open && (
        <div className="kino-menu kino-glass" role="menu">
          {children}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/ui/menus.tsx`**

```tsx
import { Popover } from "./popover"
import { useMediaSelector, usePlayer } from "../core/store"
import { GaugeIcon, SettingsIcon, CcIcon } from "./icons"

const RATES = [0.8, 1, 1.2, 1.5, 1.7, 2, 2.5]

export function SpeedMenu() {
  const { actions } = usePlayer()
  const rate = useMediaSelector((s) => s.rate)
  const canSetRate = useMediaSelector((s) => s.capabilities.canSetRate)
  if (!canSetRate) return null
  const label = rate === 2.5 ? "Max" : `${rate}x`
  return (
    <Popover
      label={`${label} speed`}
      shortcut="S"
      trigger={
        <>
          <GaugeIcon />
          <span className="kino-ctrl-label">{label}</span>
        </>
      }
    >
      {RATES.map((r) => (
        <button
          key={r}
          role="menuitemradio"
          aria-checked={r === rate}
          className="kino-menu-item"
          onClick={() => actions.setRate(r)}
        >
          {r === 2.5 ? "Max" : `${r}x`}
        </button>
      ))}
    </Popover>
  )
}

export function QualityMenu() {
  const { actions } = usePlayer()
  const qualities = useMediaSelector((s) => s.qualities)
  const active = useMediaSelector((s) => s.activeQualityId)
  const canSetQuality = useMediaSelector((s) => s.capabilities.canSetQuality)
  if (!canSetQuality || qualities.length === 0) return null
  return (
    <Popover label="Quality" trigger={<SettingsIcon />}>
      <button
        role="menuitemradio"
        aria-checked={active === "auto"}
        className="kino-menu-item"
        onClick={() => actions.setQuality("auto")}
      >
        Auto
      </button>
      {qualities.map((q) => (
        <button
          key={q.id}
          role="menuitemradio"
          aria-checked={active === q.id}
          className="kino-menu-item"
          onClick={() => actions.setQuality(q.id)}
        >
          {q.height}p
        </button>
      ))}
    </Popover>
  )
}

export function CaptionsMenu() {
  const { actions } = usePlayer()
  const tracks = useMediaSelector((s) => s.textTracks)
  const active = useMediaSelector((s) => s.activeTextTrackId)
  const hasTextTracks = useMediaSelector((s) => s.capabilities.hasTextTracks)
  if (!hasTextTracks || tracks.length === 0) return null
  return (
    <Popover label="Captions" shortcut="C" trigger={<CcIcon />}>
      <button
        role="menuitemradio"
        aria-checked={active === null}
        className="kino-menu-item"
        onClick={() => actions.setTextTrack(null)}
      >
        Off
      </button>
      {tracks.map((t) => (
        <button
          key={t.id}
          role="menuitemradio"
          aria-checked={active === t.id}
          className="kino-menu-item"
          onClick={() => actions.setTextTrack(t.id)}
        >
          {t.label || t.lang}
        </button>
      ))}
    </Popover>
  )
}
```

Add `.kino-menu`, `.kino-menu-item`, `.kino-tip`, `kbd` styles (snappy: `transition: opacity .12s, transform .12s`; menu `transform-origin: bottom`).

- [ ] **Step 5: Run tests, verify pass** — Run: `pnpm test src/ui/menus.test.tsx` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: glass popover primitive and speed/quality/captions menus"
```

---

### Task 10: Control bar, buttons, and assembled chrome

**Files:**

- Create: `src/ui/buttons.tsx`, `src/ui/control-bar.tsx`, `src/ui/control-bar.test.tsx`

**Interfaces:**

- Consumes: all UI pieces above + `useControlsVisible`, `useWrapperRef`.
- Produces: `<PlayPauseButton/>`, `<VolumeControl/>`, `<FullscreenButton/>`, `<PipButton/>`, and `<ControlBar/>` that lays them out with `<Scrubber/>` and the menus, fading via `useControlsVisible`.

- [ ] **Step 1: Write the failing test** `src/ui/control-bar.test.tsx`

```tsx
import { render, screen, act } from "@testing-library/react"
import { Player } from "./player"
import { ControlBar } from "./control-bar"
import { createFakeProvider } from "../core/fake-provider"

test("play/pause button toggles and shows time", () => {
  const provider = createFakeProvider({
    paused: true,
    duration: 68,
    currentTime: 3,
  })
  render(
    <Player provider={provider}>
      <ControlBar />
    </Player>,
  )
  expect(screen.getByText("0:03 / 1:08")).toBeInTheDocument()
  act(() => screen.getByRole("button", { name: "Play" }).click())
  expect(provider.getState().paused).toBe(false)
})
```

- [ ] **Step 2: Run it, verify it fails** — Run: `pnpm test src/ui/control-bar.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/buttons.tsx`** (play/pause, volume slider, fullscreen using `useWrapperRef`, pip gated on `capabilities.canPiP`). Each button is a `<button className="kino-ctrl" aria-label=...>` with the relevant icon and a `usePlayer()` action. Volume is an `<input type="range">` bound to `state.volume`.

- [ ] **Step 4: Implement `src/ui/control-bar.tsx`**

```tsx
import { useControlsVisible } from "./player"
import { useMediaSelector } from "../core/store"
import { formatTime } from "../util/format-time"
import { Scrubber } from "./scrubber"
import { SpeedMenu, QualityMenu, CaptionsMenu } from "./menus"
import {
  PlayPauseButton,
  VolumeControl,
  PipButton,
  FullscreenButton,
} from "./buttons"

export function ControlBar() {
  const visible = useControlsVisible()
  const currentTime = useMediaSelector((s) => s.currentTime)
  const duration = useMediaSelector((s) => s.duration)
  return (
    <div className={`kino-controls kino-glass ${visible ? "is-visible" : ""}`}>
      <Scrubber />
      <div className="kino-controls-row">
        <PlayPauseButton />
        <VolumeControl />
        <span className="kino-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="kino-controls-spacer" />
        <SpeedMenu />
        <QualityMenu />
        <CaptionsMenu />
        <PipButton />
        <FullscreenButton />
      </div>
    </div>
  )
}
```

Add `.kino-controls` styles (absolute bottom, `opacity 0` default, `.is-visible { opacity: 1 }`, slide up, padding, gap).

- [ ] **Step 5: Run tests, verify pass** — Run: `pnpm test src/ui/control-bar.test.tsx` — Expected: PASS.

- [ ] **Step 6: Export** — `src/index.ts` add `export { ControlBar } from "./ui/control-bar"` and `export { IdleOverlay } from "./ui/idle-overlay"` and `export { Scrubber } from "./ui/scrubber"`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: control bar, buttons, assembled chrome"
```

---

### Task 11: `<MuxPlayer>` drop-in and Vite demo playground

**Files:**

- Create: `src/mux/mux-player.tsx`
- Modify: `src/mux.ts` (export `MuxPlayer`)
- Create: `demo/index.html`, `demo/main.tsx`, `demo/vite.config.ts`

**Interfaces:**

- Consumes: `Player`, `ControlBar`, `IdleOverlay`, `createMuxProvider`.
- Produces: `<MuxPlayer>` with the prop surface from the spec.

- [ ] **Step 1: Implement `src/mux/mux-player.tsx`**

```tsx
import { useMemo, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { createMuxProvider, type MuxProviderOptions } from "./provider"

export type MuxPlayerProps = MuxProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  children?: ReactNode
}

export function MuxPlayer({
  accentColor,
  theme,
  className,
  children,
  ...opts
}: MuxPlayerProps) {
  // Recreate the provider only when the identity of the media changes.
  const provider = useMemo(
    () => createMuxProvider(opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.playbackId, opts.tokens?.playback],
  )
  return (
    <Player
      provider={provider}
      accentColor={accentColor}
      theme={theme}
      className={className}
    >
      <IdleOverlay />
      <ControlBar />
      {children}
    </Player>
  )
}
```

Note: `Player.Overlay` children passed via `children` render above the chrome, which is what karnstack's next-lesson overlay needs.

- [ ] **Step 2: `src/mux.ts`**

```ts
export { createMuxProvider, type MuxProviderOptions } from "./mux/provider"
export { MuxPlayer, type MuxPlayerProps } from "./mux/mux-player"
```

- [ ] **Step 3: Demo playground** — `demo/main.tsx` renders `<MuxPlayer playbackId={import.meta.env.VITE_MUX_PLAYBACK_ID} tokens={{ playback: ..., thumbnail: ..., storyboard: ... }} accentColor="oklch(50.8% 0.118 165.612)" />` inside a 16:9 box, importing `../src/styles/kino.css`. `demo/vite.config.ts` uses `@vitejs/plugin-react`. `demo/index.html` mounts `#root`. Tokens come from a local `.env` (gitignored) so no secrets are committed.

- [ ] **Step 4: Manual verification** — Run: `pnpm dev`, open the demo with a real signed Mux asset. Confirm by observation:
  - idle play button zooms on hover; speed chips start playback at the chosen rate
  - control bar auto-hides during playback, returns on pointer move
  - scrubber drag seeks; hovering shows the storyboard thumbnail + timestamp
  - speed/quality/captions popovers open and apply; quality menu lists renditions on desktop and is absent on an iOS simulator
  - fullscreen shows the custom chrome; PiP pops out
  - keyboard: space, arrows, f, m, c, digits all work

- [ ] **Step 5: Build check** — Run: `pnpm typecheck && pnpm build` — Expected: clean; `dist/mux.js`, `dist/mux.d.ts` present.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: MuxPlayer drop-in and demo playground"
```

---

### Task 12: README, license, Changesets, first release prep

**Files:**

- Create/modify: `README.md`, `.changeset/config.json`, `.changeset/initial.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:** none (docs/release).

- [ ] **Step 1: README** — public-safe. Sections: what kino is (translucent glass React player, pluggable providers), install (`pnpm add @karnstack/kino` — `@mux/mux-video` comes transitively), quick start with `<MuxPlayer>` + `import "@karnstack/kino/styles.css"`, theming (accentColor + CSS vars table), keyboard shortcuts table, capability-gating note, roadmap (YouTube/file providers, AirPlay, chapters, headless docs). No commercial-product references.

- [ ] **Step 2: Changesets** — `pnpm add -Dw @changesets/cli` (or per-repo), `pnpm changeset init`, set `config.json` access to `public`, baseBranch `main`. Add `.changeset/initial.md` describing the 0.0.1 feature set.

- [ ] **Step 3: CI** — `.github/workflows/ci.yml`: on push/PR run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

- [ ] **Step 4: Verify** — Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — Expected: all green.

- [ ] **Step 5: Commit + first GitHub push**

```bash
git add -A
git commit -m "docs: readme, changesets, ci"
gh repo create karngyan/kino --public --source=. --remote=origin --push
```

(Publishing to npm is a separate manual `pnpm changeset version && pnpm build && npm publish --access public` the user runs when ready; the plan does not auto-publish.)

---

### Task 13: Swap kino into karnstack's lesson player

**Files:**

- Modify: `MONOREPO:/Users/karn/code/karnstack/karnstack/apps/web/package.json` (add dep)
- Modify: `MONOREPO:/Users/karn/code/karnstack/karnstack/apps/web/src/components/course/lesson-video.tsx`
- Reference (unchanged): `apps/web/src/lib/mux/sign-playback.ts`, `apps/web/src/lib/mux/lesson-blurups.ts`

**Interfaces:**

- Consumes: `MuxPlayer` and `Player.Overlay` semantics from kino.
- Produces: the same `LessonVideo` public props as today (no caller changes in the course routes).

- [ ] **Step 1: Link kino into karnstack for dev**

In kino: `pnpm build`. In `MONOREPO:.../apps/web`, add the dependency. Two options, pick one and record it:

- Workspace path dep: add `"@karnstack/kino": "file:../../../kino"` to `apps/web/package.json` then `pnpm install` from the monorepo root. (kino is outside the pnpm workspace globs, so a `file:` dep is correct.)
- Or `pnpm --filter web add @karnstack/kino@file:../../../kino`.

Also note the engine: `@mux/mux-video` is a dependency of kino so it resolves transitively; no extra install needed in the app.

- [ ] **Step 2: Import the stylesheet once** — in the app's root stylesheet import (where `@karnstack/ui/globals.css` is imported), add `import "@karnstack/kino/styles.css"`. Verify the `.kino` scope does not disturb existing pages.

- [ ] **Step 3: Rewrite the persistent-player branch of `lesson-video.tsx`**

Replace the `<MuxPlayer>` (from `@mux/mux-player-react/lazy`) block (current lines ~306-343) with kino's component, preserving the surrounding token-state machine, `lastReady` swap logic, `wrapperId`, end overlay, and swap veil:

```tsx
import { MuxPlayer } from "@karnstack/kino/mux"
// remove: import MuxPlayer from "@mux/mux-player-react/lazy"

// inside the `if (lastReady)` branch, replace the <MuxPlayer .../> with:
;<MuxPlayer
  playbackId={activeTokens.playbackId}
  tokens={{
    playback: activeTokens.playback,
    thumbnail: activeTokens.thumbnail,
    storyboard: activeTokens.storyboard,
  }}
  metadata={{
    videoId: activeTokens.playbackId,
    videoTitle: title,
    viewerUserId: activeTokens.userId,
  }}
  poster={blurupFor(lessonSlug)}
  accentColor={ACCENT}
  defaultRate={rate}
  onRateChange={handleRateChange}
  onEnded={handleEnded}
>
  {ended && nextLesson && (
    <EndOverlay nextLesson={nextLesson} onPlayNext={onPlayNextClick} />
  )}
  {swapping && (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white backdrop-blur-sm">
      Loading next lesson…
    </div>
  )}
</MuxPlayer>
```

Add the `onRateChange` / `onEnded` / `onTimeUpdate` callback props to kino's `MuxPlayerProps` and emit them from the Mux provider (forward the corresponding media events). Add `fullscreenElement`/autoplay-on-load handling: expose a `playerRef` from `<MuxPlayer>` (forward a ref to the provider's `play()` and the wrapper) so the existing `handleLoadedData` autoplay and spacebar-from-article logic keep working. If forwarding a ref is too invasive for v0.0.1, keep the existing window-level spacebar handler (it already bails when focus is inside the player) and drive autoplay-next via the `autoPlay` prop on the freshly-keyed provider.

(Implementer note: the cleanest mapping is to add to kino: `onEnded`, `onRateChange`, `onTimeUpdate`, `onLoadedData` callbacks on `MuxPlayerProps`, wired in `createMuxProvider` by also calling these from the event listeners. Add these in this task, with a test in kino mirroring Task 5 asserting the callback fires.)

- [ ] **Step 4: Preserve pre-first-load states** — leave the `loading` / `not_ready` / `error` branches of `lesson-video.tsx` exactly as they are; only the persistent-player branch changes.

- [ ] **Step 5: Verify** — Run from the monorepo root: `pnpm typecheck && pnpm lint`. Then `pnpm dev` and manually confirm on a course lesson page:
  - video plays, glass controls render, scrubber preview works
  - navigating to the next lesson keeps fullscreen and swaps without a flash
  - end overlay "Up next" appears and autoplay-next works
  - chosen playback rate persists across lessons (localStorage path unchanged)

- [ ] **Step 6: Commit (on the `kino-player` branch in the monorepo)**

```bash
cd /Users/karn/code/karnstack/karnstack
git add apps/web/package.json apps/web/src/components/course/lesson-video.tsx
git commit -m "feat: adopt @karnstack/kino for the lesson video player"
```

---

## Self-Review

**Spec coverage:**

- Provider architecture, MediaState, Capabilities, store -> Tasks 2, 5.
- Subpath exports / no-Tailwind CSS / theming -> Tasks 1, 12.
- Mux verified API (raw element, renditions, image URLs, iOS gating, Mux Data, PiP, fullscreen) -> Task 5, demo-verified Task 11.
- Hover-zoom + speed pre-select -> Task 8. Glass control bar -> Task 10. Storyboard scrub preview -> Tasks 3, 7. Popovers + keyboard badges + keymap -> Tasks 4, 9, 6. Fullscreen/PiP -> Task 10. Theming/a11y -> Tasks 1, 6, 10.
- karnstack integration preserving token-swap/fullscreen/autoplay-next/rate persistence -> Task 13.
- Risks (CSS leak, renditions availability, storyboard verify, bundle size) -> addressed in Tasks 1 (scope), 5/11 (gating + demo verify), 7 (storyboard fetch with catch fallback), 12 (measure).

**Placeholder scan:** No "TBD/TODO". The one deliberate v0.0.1 simplification (`open-speed` keyboard focus into the menu) is called out explicitly in Task 6 and completed via the menus in Task 9; not a hidden gap.

**Type consistency:** `MediaState`, `Capabilities`, `Provider`, `PlayerActions`, `QualityLevel`, `TextTrackInfo`, `MuxProviderOptions`, `buildImageUrl`, `detectIOS`, `parseStoryboard`/`Storyboard`/`Tile`, `resolveKey`/`KeyAction`, `formatTime`, `useMediaSelector`/`usePlayer`/`PlayerContext`, `Player`/`Player.Overlay`/`useControlsVisible`/`useWrapperRef` — names used consistently across all referencing tasks.

```

```
