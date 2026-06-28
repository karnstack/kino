# Vimeo Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `@karnstack/kino/vimeo` provider that plays Vimeo videos under kino's glass chrome, with quality, styled captions, PiP, and rate — the richest of the iframe providers.

**Architecture:** A function factory `createVimeoProvider(opts): Provider` wraps the Vimeo Player SDK (`player.js`). It mirrors the `youtube/` shape (module-level singleton SDK loader, host `<div>`, `destroyed` flag for early teardown) but syncs state from SDK **events** (like `native/`) instead of a polling ticker. A thin `<VimeoPlayer>` React wrapper creates the provider once and routes reactive prop changes through `swapSource`. Plan-gated capabilities (quality) are derived at `loaded` rather than hardcoded.

**Tech Stack:** TypeScript, React 19, Vimeo Player SDK (loaded at runtime, hand-rolled structural types — no `@types` package, no runtime dep), vitest + jsdom, tsdown build.

## Global Constraints

- Package is single-package `@karnstack/kino` (not a monorepo). New entry point `./vimeo` mirrors `./youtube`.
- No runtime dependency on the Vimeo SDK and no `@types/*` — load the script at runtime, type its surface with a narrow local structural alias (match `YTPlayer` in `src/youtube/provider.ts` and `MuxVideoEl` in `src/mux/provider.ts`).
- SDK script URL: `https://player.vimeo.com/api/player.js`; global: `window.Vimeo.Player`. No global ready callback — resolve the loader on the injected `<script>`'s `load` event; short-circuit if `window.Vimeo` already exists.
- `Provider` contract (`src/core/types.ts`): `mount`, `getState`, `subscribe`, `actions`, `destroy`, optional `swapSource`. State shape is `MediaState`; quality items are `QualityLevel { id, height, bitrate, selected }`; tracks are `TextTrackInfo { id, kind, label, lang, mode }`; errors are `MediaError { code, message }`.
- Vimeo SDK methods all return Promises. Actions call them fire-and-forget with a trailing `.catch(() => {})`. State changes land via the echo **event**, never an optimistic patch that a rejected (plan-gated) call could leave lying. The one exception: `seek` patches `seeking: true` immediately.
- Volume is `0..1` on the Vimeo SDK — maps straight to `MediaState.volume`, **no ×100 scaling**.
- Quality height is parsed from the quality **`id`** (`"2160p"` → `2160`), never the human `label` (`"4K"` → `4`).
- `controls: false` (chromeless) is a **paid Vimeo plan** feature — document in the `<VimeoPlayer>` JSDoc; do not detect it at runtime.
- Embed terms (mirror YouTube): do not obscure the player; no poster-on-pause cover. Document in JSDoc.
- All work happens on branch `feat/vimeo-provider`; never commit to `main`. The PR is opened at the end.
- Run the full check before any "done" claim: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

---

## File Structure

- **Create** `src/vimeo/provider.ts` — `createVimeoProvider`, `VimeoProviderOptions`, `parseVimeoSource`, `playerUrl`, local SDK types, singleton loader.
- **Create** `src/vimeo/vimeo-player.tsx` — `<VimeoPlayer>` React wrapper.
- **Create** `src/vimeo/fake-vimeo.ts` — **test-only** fake `Vimeo.Player` + `installFakeVimeo()` helper (imported only by the test, so it never enters a build-entry graph and never ships).
- **Create** `src/vimeo/provider.test.ts` — vitest suite.
- **Create** `src/vimeo/vimeo-player.test.tsx` — light React wrapper test.
- **Create** `src/vimeo.ts` — entry re-export.
- **Modify** `package.json` — `exports["./vimeo"]`, `keywords` += `"vimeo"`.
- **Modify** `tsdown.config.ts` — `entry.vimeo`.
- **Modify** `README.md`, `demo/pages/providers.tsx`, `demo/pages/install.tsx`, `demo/pages/overview.tsx`, `demo/player-studio.tsx`.
- **Create** `.changeset/<name>.md`.

---

## Task 1: Source parsing + URL helper + options type

**Files:**

- Create: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type VimeoProviderOptions = { videoId: string; hash?: string; metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }; autoPlay?: boolean; muted?: boolean; loop?: boolean; defaultRate?: number }`
  - `function parseVimeoSource(input: string): { id: string; hash?: string }`
  - `function playerUrl(id: string, hash: string): string` → `https://player.vimeo.com/video/<id>?h=<hash>`

- [ ] **Step 1: Write the failing test**

Create `src/vimeo/provider.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseVimeoSource, playerUrl } from "./provider"

describe("parseVimeoSource", () => {
  it("passes a bare numeric id through", () => {
    expect(parseVimeoSource("123456789")).toEqual({ id: "123456789" })
  })
  it("extracts id from a vimeo.com URL", () => {
    expect(parseVimeoSource("https://vimeo.com/123456789")).toEqual({
      id: "123456789",
    })
  })
  it("extracts id + hash from an unlisted share URL", () => {
    expect(parseVimeoSource("https://vimeo.com/123456789/abcdef0123")).toEqual({
      id: "123456789",
      hash: "abcdef0123",
    })
  })
  it("extracts id + hash from a player.vimeo.com ?h= URL", () => {
    expect(
      parseVimeoSource("https://player.vimeo.com/video/123456789?h=xyz789"),
    ).toEqual({ id: "123456789", hash: "xyz789" })
  })
  it("returns input unchanged as id when no number is found", () => {
    expect(parseVimeoSource("not-a-vimeo")).toEqual({ id: "not-a-vimeo" })
  })
})

describe("playerUrl", () => {
  it("builds the documented ?h= embed URL", () => {
    expect(playerUrl("123456789", "abc")).toBe(
      "https://player.vimeo.com/video/123456789?h=abc",
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: FAIL — cannot resolve `./provider` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/vimeo/provider.ts`:

```ts
export type VimeoProviderOptions = {
  // A numeric Vimeo id, or any vimeo.com / player.vimeo.com URL —
  // parseVimeoSource resolves it.
  videoId: string
  // Unlisted/private hash. Also parsed from the URL form; an explicit hash here
  // wins over a URL-derived one.
  hash?: string
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}

// Pull the numeric id (and optional unlisted hash) out of any common Vimeo
// reference. A bare id is returned unchanged so callers can pass either.
//   vimeo.com/123                -> { id: "123" }
//   vimeo.com/123/HASH           -> { id: "123", hash: "HASH" }
//   player.vimeo.com/video/123?h=HASH -> { id: "123", hash: "HASH" }
export function parseVimeoSource(input: string): { id: string; hash?: string } {
  const trimmed = input.trim()
  // ?h= query form (player.vimeo.com embeds).
  const q = trimmed.match(/[?&]h=([\w]+)/)
  // /ID or /ID/HASH path form (vimeo.com share links). The id is the first
  // numeric path segment; the hash is the next path segment if present.
  const path = trimmed.match(/(?:^|\/)(\d+)(?:\/([\w]+))?/)
  if (!path) return { id: trimmed }
  const id = path[1]!
  const hash = q?.[1] ?? path[2]
  return hash ? { id, hash } : { id }
}

// The documented SDK embed URL that carries an unlisted hash.
export function playerUrl(id: string, hash: string): string {
  return `https://player.vimeo.com/video/${id}?h=${hash}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): source parsing + embed-url helper"
```

---

## Task 2: SDK loader, lifecycle, and the test fake

**Files:**

- Modify: `src/vimeo/provider.ts`
- Create: `src/vimeo/fake-vimeo.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: `VimeoProviderOptions`, `parseVimeoSource`, `playerUrl` (Task 1).
- Produces:
  - `function createVimeoProvider(opts: VimeoProviderOptions): Provider`
  - From `fake-vimeo.ts`: `class FakeVimeoPlayer` (records `calls: Array<[string, unknown]>`, exposes `emit(event, data)`, static `instances: FakeVimeoPlayer[]`, mutable `_duration/_qualities/_textTracks/_muted`), `function installFakeVimeo(): void`, `function uninstallFakeVimeo(): void`, `function flush(): Promise<void>`.

- [ ] **Step 1: Write the fake**

Create `src/vimeo/fake-vimeo.ts`:

```ts
// Test-only stand-in for the Vimeo Player SDK. jsdom has no SDK, so tests
// install this on window.Vimeo. Methods record their calls and return resolved
// promises; tests drive state by calling emit(event, payload). Imported ONLY by
// the vitest specs, so it never enters a tsdown build-entry graph.
type Handler = (data?: unknown) => void

export class FakeVimeoPlayer {
  static instances: FakeVimeoPlayer[] = []
  el: HTMLElement
  opts: Record<string, unknown>
  calls: Array<[string, unknown]> = []
  private handlers: Record<string, Set<Handler>> = {}
  _duration = 0
  _qualities: Array<{ id: string; label: string; active: boolean }> = []
  _textTracks: Array<{
    label: string
    language: string
    kind: string
    mode: string
  }> = []
  _muted = false

  constructor(el: HTMLElement, opts: Record<string, unknown>) {
    this.el = el
    this.opts = opts
    FakeVimeoPlayer.instances.push(this)
    el.appendChild(document.createElement("iframe")) // the SDK injects an iframe
  }

  on(event: string, fn: Handler) {
    ;(this.handlers[event] ??= new Set()).add(fn)
  }
  off(event: string, fn?: Handler) {
    if (fn) this.handlers[event]?.delete(fn)
    else delete this.handlers[event]
  }
  emit(event: string, data?: unknown) {
    this.handlers[event]?.forEach((fn) => fn(data))
  }

  ready() {
    return Promise.resolve()
  }
  play() {
    this.calls.push(["play", undefined])
    return Promise.resolve()
  }
  pause() {
    this.calls.push(["pause", undefined])
    return Promise.resolve()
  }
  setCurrentTime(t: number) {
    this.calls.push(["setCurrentTime", t])
    return Promise.resolve(t)
  }
  getDuration() {
    return Promise.resolve(this._duration)
  }
  getVolume() {
    return Promise.resolve(1)
  }
  setVolume(v: number) {
    this.calls.push(["setVolume", v])
    return Promise.resolve(v)
  }
  getMuted() {
    return Promise.resolve(this._muted)
  }
  setMuted(m: boolean) {
    this.calls.push(["setMuted", m])
    return Promise.resolve(m)
  }
  setPlaybackRate(r: number) {
    this.calls.push(["setPlaybackRate", r])
    return Promise.resolve(r)
  }
  getQualities() {
    return Promise.resolve(this._qualities)
  }
  setQuality(id: string) {
    this.calls.push(["setQuality", id])
    return Promise.resolve(id)
  }
  getTextTracks() {
    return Promise.resolve(this._textTracks)
  }
  enableTextTrack(language: string, kind?: string, showing?: boolean) {
    this.calls.push(["enableTextTrack", [language, kind, showing]])
    return Promise.resolve({ language, kind })
  }
  disableTextTrack() {
    this.calls.push(["disableTextTrack", undefined])
    return Promise.resolve()
  }
  requestPictureInPicture() {
    this.calls.push(["requestPictureInPicture", undefined])
    return Promise.resolve()
  }
  exitPictureInPicture() {
    this.calls.push(["exitPictureInPicture", undefined])
    return Promise.resolve()
  }
  loadVideo(idOrObj: unknown) {
    this.calls.push(["loadVideo", idOrObj])
    return Promise.resolve(idOrObj)
  }
  destroy() {
    this.calls.push(["destroy", undefined])
    return Promise.resolve()
  }
}

export function installFakeVimeo() {
  FakeVimeoPlayer.instances = []
  ;(window as unknown as { Vimeo?: unknown }).Vimeo = {
    Player: FakeVimeoPlayer,
  }
}

export function uninstallFakeVimeo() {
  delete (window as unknown as { Vimeo?: unknown }).Vimeo
  FakeVimeoPlayer.instances = []
}

// Flush pending microtasks (the provider's async reads at mount/loaded).
export function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}
```

- [ ] **Step 2: Write the failing lifecycle test**

Append to `src/vimeo/provider.test.ts`:

```ts
import { afterEach, beforeEach } from "vitest"
import { createVimeoProvider } from "./provider"
import {
  FakeVimeoPlayer,
  installFakeVimeo,
  uninstallFakeVimeo,
  flush,
} from "./fake-vimeo"

const mount = (provider: ReturnType<typeof createVimeoProvider>) => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  provider.mount(host)
  return host
}

describe("createVimeoProvider lifecycle", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  it("constructs a player with the numeric id for a public video", async () => {
    const provider = createVimeoProvider({ videoId: "123456789" })
    mount(provider)
    await flush()
    expect(FakeVimeoPlayer.instances).toHaveLength(1)
    expect(FakeVimeoPlayer.instances[0]!.opts.id).toBe("123456789")
    expect(FakeVimeoPlayer.instances[0]!.opts.url).toBeUndefined()
    expect(FakeVimeoPlayer.instances[0]!.opts.controls).toBe(false)
    provider.destroy()
  })

  it("constructs with the ?h= url when a hash is present", async () => {
    const provider = createVimeoProvider({
      videoId: "123456789",
      hash: "abc",
    })
    mount(provider)
    await flush()
    expect(FakeVimeoPlayer.instances[0]!.opts.url).toBe(
      "https://player.vimeo.com/video/123456789?h=abc",
    )
    expect(FakeVimeoPlayer.instances[0]!.opts.id).toBeUndefined()
    provider.destroy()
  })

  it("exposes default state before any event", () => {
    const provider = createVimeoProvider({ videoId: "1" })
    const s = provider.getState()
    expect(s.paused).toBe(true)
    expect(s.currentTime).toBe(0)
    provider.destroy()
  })

  it("tears down the player on destroy", async () => {
    const provider = createVimeoProvider({ videoId: "1" })
    mount(provider)
    await flush()
    const player = FakeVimeoPlayer.instances[0]!
    provider.destroy()
    expect(player.calls.map((c) => c[0])).toContain("destroy")
  })

  it("does not leave a live player if destroyed before the SDK loads", async () => {
    // No window.Vimeo yet -> loader path. Capture the injected <script>.
    uninstallFakeVimeo()
    delete (window as unknown as { Vimeo?: unknown }).Vimeo
    const provider = createVimeoProvider({ videoId: "1" })
    mount(provider)
    provider.destroy() // before the script "loads"
    installFakeVimeo()
    const script = document.querySelector(
      'script[src="https://player.vimeo.com/api/player.js"]',
    ) as HTMLScriptElement | null
    script?.dispatchEvent(new Event("load"))
    await flush()
    expect(FakeVimeoPlayer.instances).toHaveLength(0)
  })

  it("notifies subscribers on state change", async () => {
    const provider = createVimeoProvider({ videoId: "1" })
    mount(provider)
    await flush()
    let calls = 0
    provider.subscribe(() => calls++)
    FakeVimeoPlayer.instances[0]!.emit("play")
    expect(calls).toBeGreaterThan(0)
    provider.destroy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: FAIL — `createVimeoProvider` is not exported.

- [ ] **Step 4: Implement the loader + lifecycle**

Append to `src/vimeo/provider.ts` (above the helpers add the imports; the loader and factory go below them):

```ts
import { defaultState } from "../core/fake-provider"
import type { MediaState, PlayerActions, Provider } from "../core/types"

// Narrow structural view of the Vimeo Player SDK surface we touch. Hand-rolled
// (like youtube's YTPlayer) so the provider needs no runtime dep or typings.
type VimeoEventHandler = (data?: unknown) => void
export type VimeoPlayer = {
  on(event: string, handler: VimeoEventHandler): void
  off(event: string, handler?: VimeoEventHandler): void
  ready(): Promise<void>
  play(): Promise<unknown>
  pause(): Promise<unknown>
  setCurrentTime(seconds: number): Promise<number>
  getDuration(): Promise<number>
  getVolume(): Promise<number>
  setVolume(volume: number): Promise<number>
  getMuted(): Promise<boolean>
  setMuted(muted: boolean): Promise<boolean>
  setPlaybackRate(rate: number): Promise<number>
  getQualities(): Promise<Array<{ id: string; label: string; active: boolean }>>
  setQuality(id: string): Promise<string>
  getTextTracks(): Promise<
    Array<{ label: string; language: string; kind: string; mode: string }>
  >
  enableTextTrack(
    language: string,
    kind?: string,
    showing?: boolean,
  ): Promise<unknown>
  disableTextTrack(): Promise<unknown>
  requestPictureInPicture(): Promise<unknown>
  exitPictureInPicture(): Promise<unknown>
  loadVideo(
    idOrOpts: number | string | { id?: number | string; url?: string },
  ): Promise<unknown>
  destroy(): Promise<unknown>
}
type VimeoNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => VimeoPlayer
}
type VimeoWindow = Window & typeof globalThis & { Vimeo?: VimeoNamespace }

const SDK_SRC = "https://player.vimeo.com/api/player.js"

// Lazily load player.js exactly once; resolve when window.Vimeo.Player exists.
// There is no global ready callback (unlike YouTube), so we resolve on the
// script's load event. An already-present window.Vimeo short-circuits.
let apiPromise: Promise<VimeoNamespace> | null = null
function loadVimeoAPI(): Promise<VimeoNamespace> {
  const w = window as VimeoWindow
  if (w.Vimeo?.Player) return Promise.resolve(w.Vimeo)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<VimeoNamespace>((resolve, reject) => {
    const finish = () => {
      if (w.Vimeo?.Player) resolve(w.Vimeo)
      else reject(new Error("Vimeo SDK loaded but window.Vimeo is missing"))
    }
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
    if (existing) {
      existing.addEventListener("load", finish)
      return
    }
    const script = document.createElement("script")
    script.src = SDK_SRC
    script.async = true
    script.addEventListener("load", finish)
    document.head.appendChild(script)
  })
  return apiPromise
}

function readyVimeo(): VimeoNamespace | null {
  if (typeof window === "undefined") return null
  const v = (window as VimeoWindow).Vimeo
  return v && typeof v.Player === "function" ? v : null
}

export function createVimeoProvider(opts: VimeoProviderOptions): Provider {
  const explicit = parseVimeoSource(opts.videoId)
  const initial = { id: explicit.id, hash: opts.hash ?? explicit.hash }
  let player: VimeoPlayer | null = null
  let destroyed = false
  let ready = false
  let desiredRate = opts.defaultRate ?? 1

  let state: MediaState = {
    ...defaultState(),
    rate: desiredRate,
    muted: opts.muted ?? false,
    capabilities: {
      canSetRate: true, // best-effort: setPlaybackRate is plan-gated, can't probe
      hasStoryboard: false,
      canPiP: !!(
        typeof document !== "undefined" && document.pictureInPictureEnabled
      ),
      canFullscreen: true,
      // Flip on at `loaded` once getQualities/getTextTracks return non-empty.
      canSetQuality: false,
      hasTextTracks: false,
    },
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const patch = (p: Partial<MediaState>) => {
    state = { ...state, ...p }
    emit()
  }

  const onFullscreenChange = () =>
    patch({ fullscreen: document.fullscreenElement != null })

  // Stub actions; later tasks replace this object's bodies.
  const actions: PlayerActions = {
    play: () => {},
    pause: () => {},
    seek: () => {},
    setRate: () => {},
    setVolume: () => {},
    setMuted: () => {},
    setQuality: () => {},
    setTextTrack: () => {},
    enterFullscreen: () => {},
    exitFullscreen: () => {},
    enterPiP: () => {},
    exitPiP: () => {},
  }

  const createPlayer = (v: VimeoNamespace, host: HTMLElement) => {
    const ctorOpts: Record<string, unknown> = {
      controls: false, // kino owns the chrome (paid-plan feature)
      autoplay: !!opts.autoPlay,
      muted: !!opts.muted,
      loop: !!opts.loop,
      playsinline: true,
      dnt: true,
      keyboard: false,
    }
    if (initial.hash) ctorOpts.url = playerUrl(initial.id, initial.hash)
    else ctorOpts.id = initial.id
    const p = new v.Player(host, ctorOpts)
    player = p
    void p.ready().then(() => {
      if (destroyed) return
      ready = true
    })
  }

  return {
    mount(container) {
      const host = document.createElement("div")
      container.appendChild(host)
      document.addEventListener("fullscreenchange", onFullscreenChange)
      const v = readyVimeo()
      if (v) {
        createPlayer(v, host)
      } else {
        void loadVimeoAPI().then((loaded) => {
          if (destroyed) return
          if (host.isConnected) createPlayer(loaded, host)
        })
      }
    },
    getState: () => state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    actions,
    destroy() {
      destroyed = true
      ready = false
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      try {
        void player?.destroy()
      } catch {
        /* already gone */
      }
      player = null
      listeners.clear()
    },
  }
}
```

Note: the `emit`/`patch`/`subscribe` plumbing is referenced by the "notifies subscribers" test indirectly — Task 3 wires the events that call `patch`. For this task, add a temporary `play` listener so that test passes: inside `createPlayer`, after `player = p`, add `p.on("play", () => patch({ paused: false, ended: false }))`. Task 3 expands the handler set.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS (all lifecycle + parser tests).

- [ ] **Step 6: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/fake-vimeo.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): SDK loader, player lifecycle, test fake"
```

---

## Task 3: Event-driven state sync

**Files:**

- Modify: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: the `createPlayer` / `patch` from Task 2.
- Produces: a `bindEvents(p: VimeoPlayer)` step inside `createPlayer` registering all playback events. No new exports.

- [ ] **Step 1: Write the failing tests**

Append a `describe("state sync")` block to `provider.test.ts`. Helper to mount+ready+get the player:

```ts
const ready = async (o: Parameters<typeof createVimeoProvider>[0]) => {
  const provider = createVimeoProvider(o)
  mount(provider)
  await flush()
  return { provider, player: FakeVimeoPlayer.instances.at(-1)! }
}

describe("state sync", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  it("play/pause/ended set paused + ended", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("play")
    expect(provider.getState().paused).toBe(false)
    player.emit("pause")
    expect(provider.getState().paused).toBe(true)
    player.emit("ended")
    expect(provider.getState().ended).toBe(true)
    provider.destroy()
  })

  it("bufferstart keeps paused false (no poster flash)", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("play")
    player.emit("bufferstart")
    expect(provider.getState().paused).toBe(false)
    provider.destroy()
  })

  it("timeupdate updates currentTime + duration", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("timeupdate", { seconds: 12, duration: 100, percent: 0.12 })
    expect(provider.getState().currentTime).toBe(12)
    expect(provider.getState().duration).toBe(100)
    provider.destroy()
  })

  it("progress maps to buffered ranges", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("timeupdate", { seconds: 0, duration: 200, percent: 0 })
    player.emit("progress", { seconds: 0, duration: 200, percent: 0.5 })
    expect(provider.getState().buffered).toEqual([[0, 100]])
    provider.destroy()
  })

  it("volumechange reads volume AND muted", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("volumechange", { volume: 0.3, muted: true })
    expect(provider.getState().volume).toBe(0.3)
    expect(provider.getState().muted).toBe(true)
    provider.destroy()
  })

  it("error folds name into the message with code 0", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("error", { name: "PrivacyError", message: "not allowed" })
    expect(provider.getState().error).toEqual({
      code: 0,
      message: "PrivacyError: not allowed",
    })
    provider.destroy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts -t "state sync"`
Expected: FAIL — e.g. `timeupdate` does not update state yet.

- [ ] **Step 3: Implement event binding**

In `provider.ts`, replace the temporary single `p.on("play", ...)` line in `createPlayer` with a `bindEvents(p)` call, and add the function inside `createVimeoProvider` (so it closes over `patch`/`state`/`desiredRate`):

```ts
const bindEvents = (p: VimeoPlayer) => {
  p.on("play", () => patch({ paused: false, ended: false }))
  p.on("pause", () => patch({ paused: true }))
  p.on("ended", () => patch({ paused: true, ended: true }))
  p.on("bufferstart", () => patch({ paused: false }))
  p.on("bufferend", () => {})
  p.on("timeupdate", (d) => {
    const e = d as { seconds: number; duration: number }
    patch({
      currentTime: e.seconds ?? 0,
      duration: e.duration ?? state.duration,
      seeking: false,
      readyState: 4,
    })
  })
  p.on("progress", (d) => {
    const e = d as { duration: number; percent: number }
    const duration = e.duration ?? state.duration
    patch({ buffered: duration > 0 ? [[0, e.percent * duration]] : [] })
  })
  p.on("seeking", () => patch({ seeking: true }))
  p.on("seeked", (d) => {
    const e = d as { seconds?: number }
    patch({
      seeking: false,
      ended: false,
      currentTime: e?.seconds ?? state.currentTime,
    })
  })
  p.on("volumechange", (d) => {
    const e = d as { volume: number; muted?: boolean }
    patch({ volume: e.volume, muted: e.muted ?? state.muted })
  })
  p.on("playbackratechange", (d) => {
    const e = d as { playbackRate: number }
    desiredRate = e.playbackRate
    patch({ rate: e.playbackRate })
  })
  p.on("fullscreenchange", (d) => {
    const e = d as { fullscreen: boolean }
    patch({ fullscreen: !!e.fullscreen })
  })
  p.on("enterpictureinpicture", () => patch({ pip: true }))
  p.on("leavepictureinpicture", () => patch({ pip: false }))
  p.on("error", (d) => {
    const e = d as { name?: string; message?: string }
    const message = e.name
      ? `${e.name}: ${e.message ?? ""}`.trim()
      : (e.message ?? "Vimeo playback error")
    patch({ error: { code: 0, message } })
  })
}
```

Call `bindEvents(p)` in `createPlayer` right after `player = p`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS (lifecycle + state sync).

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): event-driven state sync"
```

---

## Task 4: `loaded` handler — duration, qualities, tracks, capabilities

**Files:**

- Modify: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: Task 2/3 internals.
- Produces: an async `onLoaded()` bound to the `loaded` event; sets duration, `qualities`/`activeQualityId`, `textTracks`, capability flips, re-asserts rate/mute, and media-session title. A `mapQualities(raw)` and `mapTracks(raw)` helper.

- [ ] **Step 1: Write the failing tests**

```ts
describe("loaded handler", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  it("reads duration and flips no capabilities when lists are empty", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player._duration = 90
    player.emit("loaded")
    await flush()
    expect(provider.getState().duration).toBe(90)
    expect(provider.getState().capabilities.canSetQuality).toBe(false)
    expect(provider.getState().capabilities.hasTextTracks).toBe(false)
    provider.destroy()
  })

  it("maps qualities with height parsed from id, not label", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player._qualities = [
      { id: "auto", label: "Auto", active: true },
      { id: "2160p", label: "4K", active: false },
      { id: "1080p", label: "1080p", active: false },
    ]
    player.emit("loaded")
    await flush()
    const s = provider.getState()
    expect(s.capabilities.canSetQuality).toBe(true)
    expect(s.activeQualityId).toBe("auto")
    const uhd = s.qualities.find((q) => q.id === "2160p")!
    expect(uhd.height).toBe(2160) // NOT 4 from "4K"
    provider.destroy()
  })

  it("maps text tracks with synthesized ids and flips hasTextTracks", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player._textTracks = [
      { label: "English", language: "en", kind: "captions", mode: "disabled" },
      { label: "English", language: "en", kind: "subtitles", mode: "disabled" },
    ]
    player.emit("loaded")
    await flush()
    const s = provider.getState()
    expect(s.capabilities.hasTextTracks).toBe(true)
    expect(s.textTracks.map((t) => t.id)).toEqual([
      "en.captions",
      "en.subtitles",
    ])
    provider.destroy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts -t "loaded handler"`
Expected: FAIL — duration unchanged / qualities empty.

- [ ] **Step 3: Implement**

Add helpers near the bottom of `provider.ts` (module scope):

```ts
import type { QualityLevel, TextTrackInfo } from "../core/types"

function mapQualities(
  raw: Array<{ id: string; label: string; active: boolean }>,
): { qualities: QualityLevel[]; activeId: string } {
  const qualities = raw.map((q) => ({
    id: q.id,
    height: parseInt(q.id, 10) || 0, // id is "2160p"; label "4K" would parse to 4
    bitrate: 0, // Vimeo exposes no bitrate
    selected: q.active,
  }))
  const active = raw.find((q) => q.active)?.id ?? "auto"
  return { qualities, activeId: active }
}

// getTextTracks() objects have no id; synthesize a stable one. Disambiguate
// same-language/same-kind duplicates with an index suffix.
function mapTracks(
  raw: Array<{ label: string; language: string; kind: string; mode: string }>,
): TextTrackInfo[] {
  const seen = new Map<string, number>()
  return raw.map((t) => {
    const base = `${t.language}.${t.kind}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = n === 0 ? base : `${base}.${n}`
    return {
      id,
      kind: t.kind,
      label: t.label || t.language,
      lang: t.language,
      mode: t.mode === "showing" ? "showing" : "disabled",
    }
  })
}
```

Add the media-session helper (copy from youtube's `setSessionMetadata`) and an `onLoaded` inside `createVimeoProvider`, bound in `bindEvents`:

```ts
const setSessionMetadata = (title: string) => {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  if (typeof MediaMetadata === "undefined") return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title })
  } catch {
    /* ignore */
  }
}

const onLoaded = async () => {
  if (!player) return
  const p = player
  const [duration, rawQualities, rawTracks, muted] = await Promise.all([
    p.getDuration().catch(() => 0),
    p.getQualities().catch(() => []),
    p.getTextTracks().catch(() => []),
    p.getMuted().catch(() => false),
  ])
  if (destroyed) return
  void p.setPlaybackRate(desiredRate).catch(() => {})
  const { qualities, activeId } = mapQualities(rawQualities)
  const tracks = mapTracks(rawTracks)
  setSessionMetadata(opts.metadata?.videoTitle ?? "Video")
  patch({
    duration: duration || state.duration,
    readyState: 4,
    muted,
    qualities,
    activeQualityId: activeId,
    textTracks: tracks,
    capabilities: {
      ...state.capabilities,
      canSetQuality: qualities.length > 0,
      hasTextTracks: tracks.length > 0,
    },
  })
}
```

Bind in `bindEvents`: `p.on("loaded", () => void onLoaded())`. Also add `p.on("qualitychange", (d) => patch({ activeQualityId: (d as { quality: string }).quality }))`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): loaded handler — duration, qualities, tracks, capabilities"
```

---

## Task 5: Actions

**Files:**

- Modify: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: `player`, `ready`, `desiredRate`, `patch`.
- Produces: the fully-implemented `actions` object (replaces the Task 2 stub bodies). Captions action (`setTextTrack`) is stubbed here and completed in Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
describe("actions", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())
  const names = (p: FakeVimeoPlayer) => p.calls.map((c) => c[0])

  it("play/pause/seek call the SDK; seek patches seeking immediately", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.play()
    provider.actions.pause()
    provider.actions.seek(42)
    expect(names(player)).toEqual(["play", "pause", "setCurrentTime"])
    expect(player.calls.find((c) => c[0] === "setCurrentTime")![1]).toBe(42)
    expect(provider.getState().seeking).toBe(true)
    provider.destroy()
  })

  it("setVolume passes 0..1 unscaled", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.setVolume(0.4)
    expect(player.calls).toContainEqual(["setVolume", 0.4])
    provider.destroy()
  })

  it("setRate does NOT patch rate optimistically (waits for the event)", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.setRate(2)
    expect(player.calls).toContainEqual(["setPlaybackRate", 2])
    expect(provider.getState().rate).toBe(1) // unchanged until the echo event
    player.emit("playbackratechange", { playbackRate: 2 })
    expect(provider.getState().rate).toBe(2)
    provider.destroy()
  })

  it("setQuality + PiP call the SDK", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.setQuality("1080p")
    provider.actions.enterPiP()
    provider.actions.exitPiP()
    expect(names(player)).toEqual([
      "setQuality",
      "requestPictureInPicture",
      "exitPictureInPicture",
    ])
    provider.destroy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts -t "actions"`
Expected: FAIL — stub actions record nothing.

- [ ] **Step 3: Implement**

Replace the stub `actions` object body in `createVimeoProvider`:

```ts
const actions: PlayerActions = {
  play: () => void player?.play().catch(() => {}),
  pause: () => void player?.pause().catch(() => {}),
  seek: (t) => {
    patch({ seeking: true })
    void player?.setCurrentTime(t).catch(() => {})
  },
  setRate: (r) => {
    desiredRate = r
    // No optimistic patch — rate moves on the playbackratechange echo, so a
    // plan-gated rejection never leaves the UI showing a rate that didn't take.
    void player?.setPlaybackRate(r).catch(() => {})
  },
  setVolume: (v) => void player?.setVolume(v).catch(() => {}),
  setMuted: (m) => void player?.setMuted(m).catch(() => {}),
  setQuality: (id) => void player?.setQuality(id).catch(() => {}),
  setTextTrack: () => {}, // Task 6
  enterFullscreen: (wrapper) => {
    if (wrapper.requestFullscreen) void wrapper.requestFullscreen()
  },
  exitFullscreen: () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
  },
  enterPiP: () => void player?.requestPictureInPicture().catch(() => {}),
  exitPiP: () => void player?.exitPictureInPicture().catch(() => {}),
}
```

(`actions` is referenced by the returned object; defining it before the `return` is fine since the return already references `actions`.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): player actions"
```

---

## Task 6: Captions — cue rendering + track selection

**Files:**

- Modify: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: `mapTracks` ids (Task 4), `player`, `patch`, `state`.
- Produces: real `setTextTrack` + `cuechange`/`texttrackchange` handling. A `trackRef(id)` lookup that resolves a synthesized id back to `{ language, kind }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("captions", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  const withTracks = async () => {
    const r = await ready({ videoId: "1" })
    r.player._textTracks = [
      { label: "English", language: "en", kind: "captions", mode: "disabled" },
      {
        label: "Français",
        language: "fr",
        kind: "subtitles",
        mode: "disabled",
      },
    ]
    r.player.emit("loaded")
    await flush()
    return r
  }

  it("setTextTrack(id) enables the track with showing:false", async () => {
    const { provider, player } = await withTracks()
    provider.actions.setTextTrack("fr.subtitles")
    expect(player.calls).toContainEqual([
      "enableTextTrack",
      ["fr", "subtitles", false],
    ])
    expect(provider.getState().activeTextTrackId).toBe("fr.subtitles")
    provider.destroy()
  })

  it("setTextTrack(null) disables and clears the cue", async () => {
    const { provider, player } = await withTracks()
    provider.actions.setTextTrack("en.captions")
    provider.actions.setTextTrack(null)
    expect(player.calls.map((c) => c[0])).toContain("disableTextTrack")
    expect(provider.getState().activeTextTrackId).toBe(null)
    expect(provider.getState().activeCueText).toBe("")
    provider.destroy()
  })

  it("cuechange renders the cue text in the overlay", async () => {
    const { provider, player } = await withTracks()
    provider.actions.setTextTrack("en.captions")
    player.emit("cuechange", { cues: [{ text: "Hello there" }] })
    expect(provider.getState().activeCueText).toBe("Hello there")
    player.emit("cuechange", { cues: [] })
    expect(provider.getState().activeCueText).toBe("")
    provider.destroy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts -t "captions"`
Expected: FAIL — `setTextTrack` is a no-op.

- [ ] **Step 3: Implement**

Replace `setTextTrack: () => {}` in `actions`:

```ts
    setTextTrack: (id) => {
      if (id == null) {
        patch({ activeTextTrackId: null, activeCueText: "" })
        void player?.disableTextTrack().catch(() => {})
        return
      }
      const ref = state.textTracks.find((t) => t.id === id)
      patch({ activeTextTrackId: id })
      if (ref) void player?.enableTextTrack(ref.lang, ref.kind, false).catch(() => {})
    },
```

Add to `bindEvents`:

```ts
p.on("cuechange", (d) => {
  const e = d as { cues?: Array<{ text?: string }> }
  patch({ activeCueText: e.cues?.[0]?.text ?? "" })
})
p.on("texttrackchange", (d) => {
  const e = d as { language: string | null; kind: string | null }
  if (e.language == null) {
    patch({ activeTextTrackId: null, activeCueText: "" })
    return
  }
  const match = state.textTracks.find(
    (t) => t.lang === e.language && t.kind === e.kind,
  )
  patch({ activeTextTrackId: match?.id ?? state.activeTextTrackId })
})
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): captions — overlay cues + track selection"
```

---

## Task 7: `swapSource` + the hash channel

**Files:**

- Modify: `src/vimeo/provider.ts`
- Test: `src/vimeo/provider.test.ts`

**Interfaces:**

- Consumes: `parseVimeoSource`, `playerUrl`, `player`, `ready`, `desiredRate`, `patch`.
- Produces: the optional `swapSource(opts: SourceOptions)` method on the returned provider. It reads the packed `src` string (bare id, or a `?h=` URL when unlisted).

- [ ] **Step 1: Write the failing tests**

```ts
describe("swapSource", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  it("loads a public id and resets progress + rate", async () => {
    const { provider, player } = await ready({ videoId: "1", defaultRate: 1.5 })
    player.emit("timeupdate", { seconds: 30, duration: 60, percent: 0.5 })
    provider.swapSource!({ src: "987654321" })
    expect(player.calls).toContainEqual(["loadVideo", 987654321])
    expect(player.calls).toContainEqual(["setPlaybackRate", 1.5])
    expect(provider.getState().currentTime).toBe(0)
    expect(provider.getState().ended).toBe(false)
    provider.destroy()
  })

  it("loads an unlisted source by url when src carries a hash", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.swapSource!({
      src: "https://player.vimeo.com/video/987654321?h=newhash",
    })
    expect(player.calls).toContainEqual([
      "loadVideo",
      { url: "https://player.vimeo.com/video/987654321?h=newhash" },
    ])
    provider.destroy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/vimeo/provider.test.ts -t "swapSource"`
Expected: FAIL — `provider.swapSource` is undefined.

- [ ] **Step 3: Implement**

Add `swapSource` to the returned object (after `subscribe`), and import `SourceOptions`:

```ts
import type { SourceOptions } from "../core/types"
```

```ts
    swapSource(next: SourceOptions) {
      if (!player || next.src == null) return
      const { id, hash } = parseVimeoSource(next.src)
      void player
        .loadVideo(hash ? { url: playerUrl(id, hash) } : Number(id))
        .then(() => void player?.setPlaybackRate(desiredRate).catch(() => {}))
        .catch(() => {})
      if (next.metadata?.videoTitle != null)
        setSessionMetadata(next.metadata.videoTitle)
      patch({
        currentTime: 0,
        duration: 0,
        ended: false,
        seeking: false,
        error: null,
      })
    },
```

Note: `Number(id)` is passed for the public case so `loadVideo` receives a numeric id (Vimeo accepts number | string | object).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/vimeo/provider.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add src/vimeo/provider.ts src/vimeo/provider.test.ts
git commit -m "feat(vimeo): swapSource with hash channel"
```

---

## Task 8: `<VimeoPlayer>` React wrapper + entry re-export

**Files:**

- Create: `src/vimeo/vimeo-player.tsx`
- Create: `src/vimeo.ts`
- Test: `src/vimeo/vimeo-player.test.tsx`

**Interfaces:**

- Consumes: `createVimeoProvider`, `VimeoProviderOptions`, `parseVimeoSource`, `playerUrl`.
- Produces: `function VimeoPlayer(props): JSX.Element`, `type VimeoPlayerProps`. `src/vimeo.ts` re-exports everything public.

- [ ] **Step 1: Write the failing test**

Create `src/vimeo/vimeo-player.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { VimeoPlayer } from "./vimeo-player"
import {
  FakeVimeoPlayer,
  installFakeVimeo,
  uninstallFakeVimeo,
  flush,
} from "./fake-vimeo"

describe("<VimeoPlayer>", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => {
    cleanup()
    uninstallFakeVimeo()
  })

  it("creates exactly one player and swaps on videoId change", async () => {
    const view = render(<VimeoPlayer videoId="111" />)
    await flush()
    expect(FakeVimeoPlayer.instances).toHaveLength(1)
    view.rerender(<VimeoPlayer videoId="222" />)
    await flush()
    // Still one player; the new source flows through loadVideo, not a remount.
    expect(FakeVimeoPlayer.instances).toHaveLength(1)
    expect(
      FakeVimeoPlayer.instances[0]!.calls.find((c) => c[0] === "loadVideo")![1],
    ).toBe(222)
  })

  it("swaps to a ?h= url when hash changes", async () => {
    const view = render(<VimeoPlayer videoId="111" />)
    await flush()
    view.rerender(<VimeoPlayer videoId="111" hash="secret" />)
    await flush()
    expect(
      FakeVimeoPlayer.instances[0]!.calls.find((c) => c[0] === "loadVideo")![1],
    ).toEqual({ url: "https://player.vimeo.com/video/111?h=secret" })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/vimeo/vimeo-player.test.tsx`
Expected: FAIL — cannot resolve `./vimeo-player`.

- [ ] **Step 3: Implement the component**

Create `src/vimeo/vimeo-player.tsx` (mirror `youtube-player.tsx`, threading `hash`):

```tsx
import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import {
  createVimeoProvider,
  parseVimeoSource,
  playerUrl,
  type VimeoProviderOptions,
} from "./provider"
import type { Provider } from "../core/types"

export type VimeoPlayerProps = VimeoProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /** Blur-up still painted behind the video until the first frame loads. */
  placeholder?: string
  children?: ReactNode
}

// Pack id + optional hash into the single `src` string swapSource consumes.
const packSrc = (videoId: string, hash?: string) => {
  const parsed = parseVimeoSource(videoId)
  const h = hash ?? parsed.hash
  return h ? playerUrl(parsed.id, h) : parsed.id
}

/**
 * kino's glass chrome over a Vimeo video, backed by the Vimeo Player SDK. Pass a
 * numeric id or any vimeo.com / player.vimeo.com URL; for unlisted videos pass
 * the `hash` (or a share URL that already contains it).
 *
 * Only `videoId`, `hash`, and `metadata.videoTitle` are reactive (they flow
 * through `swapSource`). `autoPlay`, `muted`, `loop`, and `defaultRate` are read
 * once at creation — remount (e.g. via `key`) to change them.
 *
 * Chromeless playback (kino owning the controls) requires a **paid** Vimeo plan;
 * on a free-account video Vimeo renders its own controls under kino's overlay.
 *
 * Per Vimeo's embed terms, kino does not obscure the player — no poster-on-pause
 * cover over the embed; kino's controls sit alongside Vimeo's surface.
 */
export function VimeoPlayer({
  accentColor,
  theme,
  className,
  placeholder,
  children,
  ...opts
}: VimeoPlayerProps) {
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createVimeoProvider(opts)
  }
  const provider = providerRef.current

  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    provider.swapSource?.({
      src: packSrc(opts.videoId, opts.hash),
      metadata: opts.metadata,
    })
  }, [opts.videoId, opts.hash, opts.metadata?.videoTitle])

  return (
    <Player
      provider={provider}
      accentColor={accentColor}
      theme={theme}
      className={className}
      placeholder={placeholder}
    >
      <IdleOverlay />
      <Captions />
      <ControlBar />
      {children}
    </Player>
  )
}
```

- [ ] **Step 4: Create the entry re-export**

Create `src/vimeo.ts`:

```ts
export {
  createVimeoProvider,
  parseVimeoSource,
  playerUrl,
  type VimeoProviderOptions,
} from "./vimeo/provider"
export { VimeoPlayer, type VimeoPlayerProps } from "./vimeo/vimeo-player"
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run src/vimeo/vimeo-player.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/vimeo/vimeo-player.tsx src/vimeo.ts src/vimeo/vimeo-player.test.tsx
git commit -m "feat(vimeo): VimeoPlayer React wrapper + entry"
```

---

## Task 9: Build wiring

**Files:**

- Modify: `package.json` (`exports`, `keywords`)
- Modify: `tsdown.config.ts` (`entry.vimeo`)

**Interfaces:**

- Consumes: `src/vimeo.ts` (Task 8).
- Produces: published `@karnstack/kino/vimeo` entry.

- [ ] **Step 1: Add the export map entry**

In `package.json`, add under `exports` after the `./youtube` block:

```json
    "./vimeo": {
      "types": "./dist/vimeo.d.ts",
      "import": "./dist/vimeo.js"
    },
```

And add `"vimeo"` to `keywords` (after `"youtube"`).

- [ ] **Step 2: Add the tsdown entry**

In `tsdown.config.ts`, add to `entry`:

```ts
    vimeo: "src/vimeo.ts",
```

- [ ] **Step 3: Verify the build, types, lint, and tests all pass**

Run:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: `dist/vimeo.js` and `dist/vimeo.d.ts` emitted; typecheck clean; lint clean; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json tsdown.config.ts
git commit -m "build(vimeo): wire ./vimeo entry point"
```

---

## Task 10: Docs, demo, changeset

**Files:**

- Modify: `README.md`, `demo/pages/providers.tsx`, `demo/pages/install.tsx`, `demo/pages/overview.tsx`, `demo/player-studio.tsx`
- Create: `.changeset/vimeo-provider.md`

**Interfaces:**

- Consumes: the shipped provider + `<VimeoPlayer>`.
- Produces: docs/demo that advertise four shipped providers.

- [ ] **Step 1: Flip the demo provider card**

In `demo/pages/providers.tsx`, change the Vimeo entry to shipped:

```ts
  {
    name: "Vimeo",
    status: "shipped",
    entry: "@karnstack/kino/vimeo",
    detail:
      "The Vimeo Player SDK under the same kino chrome — quality, styled captions, picture-in-picture, and rate. Chromeless playback needs a paid Vimeo plan.",
    importLine: 'import { VimeoPlayer } from "@karnstack/kino/vimeo"',
  },
```

- [ ] **Step 2: README — add Vimeo usage + drop from roadmap**

Add a "Playing a Vimeo video" section near the YouTube one:

````markdown
### Playing a Vimeo video

```tsx
import { VimeoPlayer } from "@karnstack/kino/vimeo"
import "@karnstack/kino/styles.css"

export default function Watch() {
  return <VimeoPlayer videoId="76979871" accentColor="#00adef" />
}
```

For an unlisted video, pass the hash (or a share URL that contains it):

```tsx
<VimeoPlayer videoId="123456789" hash="abcdef0123" />
```

Chromeless playback (kino owning the controls) requires a paid Vimeo plan.
````

Remove "Vimeo" from the roadmap/planned list and add it to the shipped-providers list/entry-points table.

- [ ] **Step 3: install.tsx + overview.tsx + player-studio.tsx**

- `demo/pages/install.tsx`: add a Vimeo import snippet and a `VimeoPlayer` props table mirroring the YouTube entry (props: `videoId`, `hash`, `metadata`, `autoPlay`, `muted`, `loop`, `defaultRate`, plus the shared `accentColor/theme/className/placeholder`).
- `demo/pages/overview.tsx`: update the highlight copy to state Vimeo now ships (match the existing sentence pattern that lists providers).
- `demo/player-studio.tsx`: add a "Vimeo" provider tab rendering `<VimeoPlayer videoId="76979871" />` (a public, chromeless-eligible Vimeo staff-pick id), mirroring the YouTube tab wiring.

(Read each file first and follow its existing data-shape; these are copy/data additions, not new patterns.)

- [ ] **Step 4: Add the changeset**

Create `.changeset/vimeo-provider.md`:

```markdown
---
"@karnstack/kino": minor
---

Add a Vimeo provider (`@karnstack/kino/vimeo`) — the Vimeo Player SDK under
kino's chrome with quality selection, styled captions, picture-in-picture, and
playback rate. Supports unlisted videos via a `hash`. Import `VimeoPlayer` or
the lower-level `createVimeoProvider`.
```

- [ ] **Step 5: Verify the demo builds + full check**

Run:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all clean/PASS. (Optionally `pnpm dev` and eyeball the Vimeo studio tab per the headless-screenshot workflow.)

- [ ] **Step 6: Commit**

```bash
git add README.md demo/ .changeset/vimeo-provider.md
git commit -m "docs(vimeo): README, demo, changeset"
```

---

## Final: open the PR

- [ ] Push the branch and open the PR (only when the user asks):

```bash
git push -u origin feat/vimeo-provider
gh pr create --base main --title "feat: Vimeo provider" --body "<summary + test plan>"
```

---

## Self-Review Notes (plan author)

- **Spec coverage:** loader/lifecycle (T2), event sync incl. bufferstart/volumechange.muted/error.name (T3), loaded+quality height-from-id+synthesized track ids+capability flips (T4), actions with no-optimistic-rate (T5), captions overlay via cuechange + enableTextTrack(…,false) (T6), hash channel through swapSource (T7), `<VimeoPlayer>` reactive machinery incl. `hash` dep (T8), wiring + keywords (T9), docs/demo/changeset + paid-plan caveat (T10). All spec sections map to a task.
- **Plan-gated capabilities:** `canSetQuality`/`hasTextTracks` start false and flip at `loaded`; `canSetRate` documented best-effort; rate state event-driven (T5 test asserts no optimistic patch).
- **Type consistency:** `QualityLevel{id,height,bitrate,selected}`, `TextTrackInfo{id,kind,label,lang,mode}`, `MediaError{code,message}` used consistently; `mapQualities`/`mapTracks`/`parseVimeoSource`/`playerUrl`/`packSrc` names stable across tasks.
- **No placeholders:** every code step shows complete code; commands have expected output.
