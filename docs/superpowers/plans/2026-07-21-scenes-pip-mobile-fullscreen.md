# Scenes PiP + Mobile Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give scene-sequence playback picture-in-picture (Document PiP, Chromium desktop) and working fullscreen on iPhone-class WebKit (pseudo-fullscreen fallback).

**Architecture:** A standalone pseudo-fullscreen util pins the player wrapper when `Element.requestFullscreen` is absent. PiP moves the scenes iframe into a `documentPictureInPicture` window; the cross-document move reloads the iframe, so the provider remembers `{time, playing}` and replays it through a new optional `startTime` field on `kino:init`. The host additionally accepts commands from `window.parent.opener`, because inside the pip window the host's parent is the pip window while commands still come from the main tab.

**Tech Stack:** TypeScript, vitest + jsdom (co-located `*.test.ts`), no new dependencies.

Spec: `docs/superpowers/specs/2026-07-21-scenes-pip-mobile-fullscreen-design.md`.

## Global Constraints

- Scenes-entry only: no changes to mux/native/vimeo/youtube providers.
- Kino is platform-agnostic: say "scene sequence", never "lesson", in code, docs, and copy.
- Protocol changes must be additive; `SceneManifest.version` stays `1`.
- `canPiP` must be `false` when `documentPictureInPicture` is absent (SSR-safe: guard `typeof window !== "undefined"`).
- User-visible copy is sentence case ("Playing in picture in picture").
- No em dashes in prose, comments, or commit messages. No Claude co-author trailer or Claude references in commits.
- Versioning via changesets only; do not bump `package.json`. PR only; never merge or publish.
- Gate for every task: `pnpm test` (vitest), `pnpm typecheck` if the script exists (check `package.json`; otherwise `pnpm build` typechecks), `pnpm lint` if present.

---

### Task 1: Pseudo-fullscreen util

**Files:**
- Create: `src/util/pseudo-fullscreen.ts`
- Test: `src/util/pseudo-fullscreen.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `enterPseudoFullscreen(wrapper: HTMLElement): () => void` (returns idempotent restore fn). Task 3 imports it as `import { enterPseudoFullscreen } from "../util/pseudo-fullscreen"`.

- [ ] **Step 1: Write the failing test**

```ts
import { enterPseudoFullscreen } from "./pseudo-fullscreen"

// jsdom's CSS parser drops values it cannot parse (100dvh, env()), so the
// assertions stick to properties jsdom round-trips: position, z-index,
// overflow. The save/restore behavior is what matters here.

test("applies fixed positioning and locks page scroll", () => {
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  const restore = enterPseudoFullscreen(wrapper)
  expect(wrapper.style.position).toBe("fixed")
  expect(wrapper.style.zIndex).toBe("2147483647")
  expect(document.documentElement.style.overflow).toBe("hidden")
  expect(document.body.style.overflow).toBe("hidden")
  restore()
  wrapper.remove()
})

test("restore reinstates prior inline values exactly", () => {
  const wrapper = document.createElement("div")
  wrapper.style.position = "relative"
  wrapper.style.background = "red"
  document.body.appendChild(wrapper)
  document.body.style.overflow = "scroll"
  const restore = enterPseudoFullscreen(wrapper)
  restore()
  expect(wrapper.style.position).toBe("relative")
  expect(wrapper.style.background).toBe("red")
  expect(wrapper.style.zIndex).toBe("")
  expect(document.body.style.overflow).toBe("scroll")
  expect(document.documentElement.style.overflow).toBe("")
  document.body.style.overflow = ""
  wrapper.remove()
})

test("restore is idempotent", () => {
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  const restore = enterPseudoFullscreen(wrapper)
  restore()
  wrapper.style.position = "sticky"
  restore()
  expect(wrapper.style.position).toBe("sticky")
  wrapper.remove()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/util/pseudo-fullscreen.test.ts`
Expected: FAIL, cannot resolve `./pseudo-fullscreen`.

- [ ] **Step 3: Write the implementation**

```ts
// Fullscreen fallback for browsers without Element.requestFullscreen
// (iPhone-class WebKit, where the API does not exist at all). Pins the
// wrapper over the page and locks scroll. No fullscreenchange event fires
// in this mode, so the caller owns the fullscreen state transition.

type SavedStyle = { el: HTMLElement; prop: string; value: string }

export function enterPseudoFullscreen(wrapper: HTMLElement): () => void {
  const saved: SavedStyle[] = []
  const set = (el: HTMLElement, prop: string, value: string) => {
    saved.push({ el, prop, value: el.style.getPropertyValue(prop) })
    el.style.setProperty(prop, value)
  }
  set(wrapper, "position", "fixed")
  set(wrapper, "inset", "0")
  set(wrapper, "width", "100vw")
  // dvh tracks the iOS toolbar collapse; vh would leave a dead strip.
  set(wrapper, "height", "100dvh")
  set(wrapper, "z-index", "2147483647")
  set(wrapper, "background", "#000")
  set(
    wrapper,
    "padding",
    "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
  )
  set(document.documentElement, "overflow", "hidden")
  set(document.body, "overflow", "hidden")
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const { el, prop, value } of saved) {
      if (value) el.style.setProperty(prop, value)
      else el.style.removeProperty(prop)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/util/pseudo-fullscreen.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add src/util/pseudo-fullscreen.ts src/util/pseudo-fullscreen.test.ts
git commit -m "feat(scenes): pseudo-fullscreen fallback util"
```

---

### Task 2: Protocol `startTime` + host resume seek, tolerant autoplay, opener source

**Files:**
- Modify: `src/scenes/protocol.ts` (the `kino:init` member of `HostCommand`)
- Modify: `src/scenes/host.tsx` (the `onCommand` handler, around lines 136-160)
- Test: `src/scenes/host.test.tsx` (append tests; follow the file's existing helpers for constructing hosts and dispatching commands)

**Interfaces:**
- Consumes: nothing new.
- Produces: `kino:init` accepts optional `startTime?: number` (global sequence seconds, clamped by the host to `[0, manifest.duration]`); host accepts commands whose `ev.source` is `window.parent.opener`. Task 5's provider relies on both.

- [ ] **Step 1: Write the failing tests**

Append to `src/scenes/host.test.tsx`, reusing the file's existing setup helpers (read the file first; it already builds a host with a manifest and dispatches command MessageEvents). New cases:

```ts
test("init with startTime seeks the audio before playback", () => {
  // build host via the file's existing helper; manifest duration >= 10
  sendCommand({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: 7.5,
  })
  expect(audio.currentTime).toBe(7.5)
})

test("init startTime clamps to the sequence duration", () => {
  sendCommand({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: 9999,
  })
  expect(audio.currentTime).toBe(manifest.duration)
  sendCommand({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: -3,
  })
  expect(audio.currentTime).toBe(0)
})

test("init autoPlay rejection is swallowed", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(
    new DOMException("NotAllowedError"),
  )
  sendCommand({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: true,
  })
  await Promise.resolve()
  // No unhandled rejection: reaching this line without vitest flagging one
  // is the assertion.
})

test("commands from window.parent.opener are accepted", () => {
  // In a document pip window the host's parent is the pip window and the
  // controlling document is that window's opener. jsdom cannot make a real
  // second Window, so a MessagePort stands in: any MessageEventSource works
  // for the identity check.
  const port = new MessageChannel().port1
  Object.defineProperty(window, "opener", { value: port, configurable: true })
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "kino:pause" },
      source: port,
    }),
  )
  expect(audio.paused).toBe(true)
  Object.defineProperty(window, "opener", { value: null, configurable: true })
})

test("commands from unrelated sources are still dropped", () => {
  const stranger = new MessageChannel().port2
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "kino:play" },
      source: stranger,
    }),
  )
  expect(audio.paused).toBe(true)
})
```

Adapt `sendCommand`/`audio`/`manifest` to whatever the file's existing helpers are named; do not invent a parallel harness.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run src/scenes/host.test.tsx`
Expected: new tests FAIL (`startTime` not honored, opener source dropped); existing tests PASS.

- [ ] **Step 3: Implement**

`src/scenes/protocol.ts`, extend the `kino:init` member:

```ts
  | {
      type: "kino:init"
      rate: number
      volume: number
      muted: boolean
      autoPlay: boolean
      // Optional resume point in global sequence seconds. Used after the
      // iframe reloads from a cross-document move (document pip), so
      // playback continues where it left off.
      startTime?: number
    }
```

`src/scenes/host.tsx`, in `onCommand`:

```ts
  const onCommand = (ev: MessageEvent) => {
    // Only the embedding page may drive playback: the message must come from
    // the parent window, and when parentOrigin is locked down, from that
    // origin. Inside a document pip window the host's parent is the pip
    // window itself while commands still originate from the main tab, which
    // is the pip window's opener; opener is on the cross-origin-readable
    // Window property list, and the origin check above still applies.
    if (parentOrigin !== "*" && ev.origin !== parentOrigin) return
    const opener = window.parent.opener as Window | null
    if (ev.source !== window.parent && (opener == null || ev.source !== opener))
      return
```

and in the `kino:init` case:

```ts
      case "kino:init":
        audio.playbackRate = msg.rate
        audio.volume = msg.volume
        audio.muted = msg.muted
        if (msg.startTime != null) {
          audio.currentTime = Math.min(
            Math.max(0, msg.startTime),
            manifest.duration,
          )
          syncTime()
          postState()
        }
        // A reloaded pip iframe may lack user activation; a rejected play
        // just leaves the host paused. Promise.resolve guards jsdom stubs
        // that return undefined from play().
        if (msg.autoPlay) void Promise.resolve(audio.play()).catch(() => {})
        break
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scenes/host.test.tsx`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add src/scenes/protocol.ts src/scenes/host.tsx src/scenes/host.test.tsx
git commit -m "feat(scenes): init startTime resume, tolerant autoplay, opener command source"
```

---

### Task 3: Provider pseudo-fullscreen integration

**Files:**
- Modify: `src/scenes/provider.ts` (`enterFullscreen`/`exitFullscreen` actions, `destroy`)
- Test: `src/scenes/provider.test.ts` (append)

**Interfaces:**
- Consumes: `enterPseudoFullscreen` from Task 1.
- Produces: a module-local `let pseudoRestore: (() => void) | null` inside `createScenesProvider`; Task 5's `enterPiP` clears it the same way `exitFullscreen` does.

- [ ] **Step 1: Write the failing tests**

Append to `src/scenes/provider.test.ts` (reuse the file's `mount` helper):

```ts
test("fullscreen falls back to pseudo mode when requestFullscreen is missing", () => {
  const p = createScenesProvider({ src: SRC })
  mount(p)
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  // jsdom has no Element.requestFullscreen, which is exactly the
  // iPhone-class environment under test.
  expect(wrapper.requestFullscreen).toBeUndefined()
  p.actions.enterFullscreen(wrapper)
  expect(wrapper.style.position).toBe("fixed")
  expect(p.getState().fullscreen).toBe(true)
  p.actions.exitFullscreen()
  expect(wrapper.style.position).toBe("")
  expect(p.getState().fullscreen).toBe(false)
  p.destroy()
  wrapper.remove()
})

test("native requestFullscreen is preferred when present", () => {
  const p = createScenesProvider({ src: SRC })
  mount(p)
  const wrapper = document.createElement("div")
  const request = vi.fn().mockResolvedValue(undefined)
  ;(wrapper as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen = request
  p.actions.enterFullscreen(wrapper)
  expect(request).toHaveBeenCalledOnce()
  expect(wrapper.style.position).toBe("")
  p.destroy()
})

test("destroy restores pseudo-fullscreen scroll lock", () => {
  const p = createScenesProvider({ src: SRC })
  mount(p)
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  p.actions.enterFullscreen(wrapper)
  expect(document.body.style.overflow).toBe("hidden")
  p.destroy()
  expect(document.body.style.overflow).toBe("")
  wrapper.remove()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scenes/provider.test.ts`
Expected: new tests FAIL (`state.fullscreen` never patches, styles untouched); existing tests PASS.

- [ ] **Step 3: Implement**

In `src/scenes/provider.ts`: import the util, add the local, replace the fullscreen actions, extend `destroy`.

```ts
import { enterPseudoFullscreen } from "../util/pseudo-fullscreen"
```

Near the other locals (`let iframe`, `let vttCues`, ...):

```ts
  // Restore fn while pseudo-fullscreen (no Element.requestFullscreen, i.e.
  // iPhone-class WebKit) is active. Null otherwise.
  let pseudoRestore: (() => void) | null = null
```

Actions:

```ts
    enterFullscreen: (wrapper) => {
      if (wrapper.requestFullscreen) {
        void wrapper.requestFullscreen()
        return
      }
      if (pseudoRestore) return
      pseudoRestore = enterPseudoFullscreen(wrapper)
      // No fullscreenchange fires in pseudo mode; own the transition.
      patch({ fullscreen: true })
    },
    exitFullscreen: () => {
      if (pseudoRestore) {
        pseudoRestore()
        pseudoRestore = null
        patch({ fullscreen: false })
        return
      }
      if (document.fullscreenElement) void document.exitFullscreen?.()
    },
```

In `destroy()`, before `iframe?.remove()`:

```ts
      pseudoRestore?.()
      pseudoRestore = null
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scenes/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add src/scenes/provider.ts src/scenes/provider.test.ts
git commit -m "feat(scenes): pseudo-fullscreen fallback in the scenes provider"
```

---

### Task 4: PiP surfaces (inline placeholder + pip window overlay)

**Files:**
- Create: `src/scenes/pip-surfaces.ts`
- Modify: `src/styles/kino.css` (one new rule; read the existing `.kino-placeholder` rule first and match its conventions)
- Test: `src/scenes/pip-surfaces.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 5 imports both):

```ts
export type PipOverlayDeps = {
  play(): void
  pause(): void
  getState(): { paused: boolean; activeCueText: string }
  subscribe(listener: () => void): () => void
}
export function mountPipPlaceholder(container: HTMLElement, onReturn: () => void): () => void
export function mountPipOverlay(pipWindow: Window, deps: PipOverlayDeps): () => void
```

Both return cleanup functions. `MediaState` structurally satisfies the `getState` shape.

- [ ] **Step 1: Write the failing tests**

```ts
import { mountPipPlaceholder, mountPipOverlay } from "./pip-surfaces"

test("placeholder mounts, forwards clicks, and cleans up", () => {
  const container = document.createElement("div")
  const onReturn = vi.fn()
  const cleanup = mountPipPlaceholder(container, onReturn)
  const el = container.querySelector(".kino-pip-placeholder") as HTMLElement
  expect(el.textContent).toBe("Playing in picture in picture")
  el.click()
  expect(onReturn).toHaveBeenCalledOnce()
  cleanup()
  expect(container.querySelector(".kino-pip-placeholder")).toBeNull()
})

function overlayHarness(state: { paused: boolean; activeCueText: string }) {
  const listeners = new Set<() => void>()
  const deps = {
    play: vi.fn(),
    pause: vi.fn(),
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  return { deps, emit: () => listeners.forEach((l) => l()), listeners }
}

test("overlay toggles play/pause off provider state and mirrors cue text", () => {
  const state = { paused: true, activeCueText: "" }
  const { deps, emit } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const btn = document.body.querySelector(
    "[data-kino-pip-overlay] button",
  ) as HTMLButtonElement
  expect(btn.getAttribute("aria-label")).toBe("Play")
  btn.click()
  expect(deps.play).toHaveBeenCalledOnce()
  state.paused = false
  state.activeCueText = "hello from the sequence"
  emit()
  expect(btn.getAttribute("aria-label")).toBe("Pause")
  expect(
    document.body.querySelector("[data-kino-pip-overlay]")!.textContent,
  ).toContain("hello from the sequence")
  btn.click()
  expect(deps.pause).toHaveBeenCalledOnce()
  cleanup()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
})

test("overlay cleanup unsubscribes", () => {
  const { deps, listeners } = overlayHarness({ paused: true, activeCueText: "" })
  const cleanup = mountPipOverlay(window, deps)
  expect(listeners.size).toBe(1)
  cleanup()
  expect(listeners.size).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scenes/pip-surfaces.test.ts`
Expected: FAIL, cannot resolve `./pip-surfaces`.

- [ ] **Step 3: Implement**

`src/scenes/pip-surfaces.ts`:

```ts
// Parent-origin DOM for document picture-in-picture: the placeholder shown
// inline where the stage was, and the minimal controls overlaid on the pip
// window (the main tab's chrome is not visible from there). The overlay uses
// inline styles because kino.css is not loaded in the pip window; copying
// stylesheets across is not worth it for two elements.

export type PipOverlayDeps = {
  play(): void
  pause(): void
  getState(): { paused: boolean; activeCueText: string }
  subscribe(listener: () => void): () => void
}

export function mountPipPlaceholder(
  container: HTMLElement,
  onReturn: () => void,
): () => void {
  const el = document.createElement("div")
  el.className = "kino-pip-placeholder"
  el.textContent = "Playing in picture in picture"
  el.addEventListener("click", onReturn)
  container.appendChild(el)
  return () => el.remove()
}

export function mountPipOverlay(
  pipWindow: Window,
  deps: PipOverlayDeps,
): () => void {
  const doc = pipWindow.document
  const bar = doc.createElement("div")
  bar.setAttribute("data-kino-pip-overlay", "")
  bar.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;padding:12px;background:linear-gradient(transparent,rgba(0,0,0,.7));font-family:system-ui,sans-serif;"
  const btn = doc.createElement("button")
  btn.type = "button"
  btn.style.cssText =
    "background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px;"
  const cue = doc.createElement("div")
  cue.style.cssText =
    "color:#fff;font-size:13px;line-height:1.3;flex:1;text-shadow:0 1px 2px rgba(0,0,0,.8);"
  const render = () => {
    const s = deps.getState()
    btn.textContent = s.paused ? "▶" : "⏸"
    btn.setAttribute("aria-label", s.paused ? "Play" : "Pause")
    cue.textContent = s.activeCueText
  }
  btn.addEventListener("click", () => {
    if (deps.getState().paused) deps.play()
    else deps.pause()
  })
  const unsubscribe = deps.subscribe(render)
  render()
  bar.append(btn, cue)
  doc.body.appendChild(bar)
  return () => {
    unsubscribe()
    bar.remove()
  }
}
```

`src/styles/kino.css`, after the existing `.kino-placeholder` rule (match its font/color values if they differ from these):

```css
.kino .kino-pip-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #000;
  color: rgba(255, 255, 255, 0.7);
  font:
    500 14px/1.4 system-ui,
    sans-serif;
  cursor: pointer;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scenes/pip-surfaces.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add src/scenes/pip-surfaces.ts src/scenes/pip-surfaces.test.ts src/styles/kino.css
git commit -m "feat(scenes): pip placeholder and pip window overlay surfaces"
```

---

### Task 5: Provider document PiP core

**Files:**
- Modify: `src/scenes/provider.ts`
- Test: `src/scenes/provider.test.ts` (append)

**Interfaces:**
- Consumes: `mountPipPlaceholder`/`mountPipOverlay`/`PipOverlayDeps` (Task 4), `kino:init.startTime` (Task 2), `pseudoRestore` local (Task 3).
- Produces: `capabilities.canPiP` true iff `documentPictureInPicture` exists; working `enterPiP`/`exitPiP`; `state.pip` transitions. Consumed by the existing `PipButton` with zero UI changes.

- [ ] **Step 1: Write the failing tests**

Append to `src/scenes/provider.test.ts`:

```ts
// Stand-in for a document pip window. Reuses the main jsdom document so the
// moved iframe keeps a live contentWindow (a detached document would null it,
// which real Chrome does not do). EventTarget covers addEventListener for
// "message" and "pagehide".
class FakePipWindow extends EventTarget {
  document = window.document
  closed = false
  close() {
    if (this.closed) return
    this.closed = true
    this.dispatchEvent(new Event("pagehide"))
  }
}

function installFakeDocumentPiP(win: FakePipWindow) {
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: { requestWindow: vi.fn().mockResolvedValue(win) },
  })
  return () => {
    delete (window as { documentPictureInPicture?: unknown })
      .documentPictureInPicture
  }
}

test("canPiP reflects documentPictureInPicture presence", () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  expect(p.getState().capabilities.canPiP).toBe(true)
  p.destroy()
  uninstall()
})

test("enterPiP moves the iframe, mounts surfaces, and resumes via init startTime", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, snapshot(1)) // playing at currentTime 0 per the helper
  p.actions.seek(12)
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  expect(iframe.parentElement).toBe(document.body)
  expect(host.querySelector(".kino-pip-placeholder")).not.toBeNull()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).not.toBeNull()
  // The reloaded iframe announces ready again; the provider must resume.
  const post = vi.spyOn(iframe.contentWindow!, "postMessage")
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  const init = post.mock.calls
    .map((c) => c[0] as { type: string; startTime?: number; autoPlay?: boolean })
    .find((m) => m.type === "kino:init")
  expect(init?.startTime).toBe(12)
  expect(init?.autoPlay).toBe(true)
  p.destroy()
  uninstall()
})

test("pip window close moves the iframe back and clears pip state", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  p.actions.exitPiP()
  expect(p.getState().pip).toBe(false)
  expect(iframe.parentElement).toBe(host)
  expect(host.querySelector(".kino-pip-placeholder")).toBeNull()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
  p.destroy()
  uninstall()
})

test("destroy while in pip closes the pip window", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  p.destroy()
  expect(fake.closed).toBe(true)
  uninstall()
})

test("requestWindow rejection leaves state untouched", async () => {
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: { requestWindow: vi.fn().mockRejectedValue(new Error("denied")) },
  })
  const p = createScenesProvider({ src: SRC })
  mount(p)
  p.actions.enterPiP()
  await Promise.resolve()
  await Promise.resolve()
  expect(p.getState().pip).toBe(false)
  p.destroy()
  delete (window as { documentPictureInPicture?: unknown })
    .documentPictureInPicture
})

test("enterFullscreen is a no-op while in pip", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const wrapper = document.createElement("div")
  p.actions.enterFullscreen(wrapper)
  expect(wrapper.style.position).toBe("")
  expect(p.getState().fullscreen).toBe(false)
  p.destroy()
  uninstall()
})
```

Note for the implementer: the existing capabilities test asserting `canPiP` is `false` stays valid (plain jsdom has no `documentPictureInPicture`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/scenes/provider.test.ts`
Expected: new tests FAIL (canPiP false, enterPiP no-op); existing tests PASS.

- [ ] **Step 3: Implement**

In `src/scenes/provider.ts`:

Imports:

```ts
import { mountPipPlaceholder, mountPipOverlay } from "./pip-surfaces"
```

Locals (near `let iframe`):

```ts
  let mountContainer: HTMLElement | null = null
  let pipWindow: (Window & { close(): void }) | null = null
  let pipCleanups: Array<() => void> = []
  let onPipPagehide: (() => void) | null = null
  // Resume point captured before an iframe-reloading move (into or out of
  // the pip window); consumed by the next kino:ready.
  let resume: { time: number; playing: boolean } | null = null
```

Minimal structural type for the API (top of file, after imports):

```ts
type DocumentPiPHost = Window & {
  documentPictureInPicture?: {
    requestWindow(opts?: { width?: number; height?: number }): Promise<Window>
  }
}
```

Capability:

```ts
      canPiP:
        typeof window !== "undefined" &&
        (window as DocumentPiPHost).documentPictureInPicture != null,
```

`kino:ready` case becomes:

```ts
      case "kino:ready":
        patch({ duration: msg.duration })
        send({
          type: "kino:init",
          rate: desiredRate,
          volume: state.volume,
          muted: state.muted,
          ...(resume
            ? { autoPlay: resume.playing, startTime: resume.time }
            : { autoPlay: opts.autoPlay ?? false }),
        })
        resume = null
        break
```

Pagehide handler and pip actions (replace the empty `enterPiP`/`exitPiP`):

```ts
    enterPiP: () => {
      void (async () => {
        const dpp = (window as DocumentPiPHost).documentPictureInPicture
        if (!dpp || pipWindow || !iframe || !mountContainer) return
        if (pseudoRestore) {
          pseudoRestore()
          pseudoRestore = null
          patch({ fullscreen: false })
        }
        resume = { time: state.currentTime, playing: !state.paused }
        let win: Window
        try {
          const w = mountContainer.clientWidth
          const h = mountContainer.clientHeight
          win = await dpp.requestWindow({
            width: 480,
            height: w > 0 && h > 0 ? Math.round((480 * h) / w) : 270,
          })
        } catch {
          resume = null
          return
        }
        pipWindow = win as Window & { close(): void }
        win.document.body.style.margin = "0"
        win.document.body.style.background = "#000"
        // Cross-document move; the iframe reloads and the resume point
        // above replays through kino:init.
        win.document.body.appendChild(iframe)
        // Inside the pip window the host's parent is the pip window, so its
        // events land there, not on the main window.
        win.addEventListener("message", onMessage)
        pipCleanups = [
          mountPipPlaceholder(mountContainer, actions.exitPiP),
          mountPipOverlay(win, {
            play: actions.play,
            pause: actions.pause,
            getState: () => state,
            subscribe: (l) => {
              listeners.add(l)
              return () => listeners.delete(l)
            },
          }),
        ]
        onPipPagehide = () => {
          if (!pipWindow) return
          const closing = pipWindow
          pipWindow = null
          closing.removeEventListener("message", onMessage)
          if (onPipPagehide)
            closing.removeEventListener("pagehide", onPipPagehide)
          onPipPagehide = null
          pipCleanups.forEach((c) => c())
          pipCleanups = []
          // Position advanced while in pip; capture again for the reload
          // caused by moving the iframe home.
          resume = { time: state.currentTime, playing: !state.paused }
          if (iframe && mountContainer) mountContainer.appendChild(iframe)
          patch({ pip: false })
        }
        win.addEventListener("pagehide", onPipPagehide)
        patch({ pip: true })
      })()
    },
    exitPiP: () => {
      pipWindow?.close()
    },
```

`enterFullscreen` gains a first line:

```ts
    enterFullscreen: (wrapper) => {
      // The stage lives in another window during pip; the fullscreen button
      // in the main tab has nothing to expand.
      if (pipWindow) return
```

`mount(container)` records the container (first line of the method body):

```ts
    mount(container) {
      mountContainer = container
```

`destroy()` becomes:

```ts
    destroy() {
      window.removeEventListener("message", onMessage)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      pseudoRestore?.()
      pseudoRestore = null
      // Fires the pagehide handler, which moves the iframe back and clears
      // pip state before the teardown below.
      pipWindow?.close()
      iframe?.remove()
      iframe = null
      mountContainer = null
      listeners.clear()
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/scenes/provider.test.ts`
Expected: PASS, all new and existing tests.

- [ ] **Step 5: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add src/scenes/provider.ts src/scenes/provider.test.ts
git commit -m "feat(scenes): document picture-in-picture for scene sequences"
```

---

### Task 6: Docs + changeset

**Files:**
- Modify: `demo/pages/providers.tsx` (scenes provider section)
- Create: `.changeset/scenes-pip-fullscreen.md`

**Interfaces:**
- Consumes: behavior shipped in Tasks 1-5.
- Produces: nothing downstream.

- [ ] **Step 1: Update the providers docs page**

Read `demo/pages/providers.tsx` and find the scenes provider section. Add prose (matching the page's existing tone and components) covering:

- Picture-in-picture uses the Document Picture-in-Picture API, so it is available on Chromium desktop browsers; elsewhere the `canPiP` capability is false and the button hides itself. Entering or leaving pip reloads the sequence iframe and playback resumes at the same position automatically.
- Fullscreen falls back to a pseudo-fullscreen presentation (fixed-position wrapper, custom controls stay on screen) on browsers without `Element.requestFullscreen`, notably iPhone Safari and iPhone Chrome.

Keep it platform-agnostic: "scene sequence", never "lesson".

- [ ] **Step 2: Create the changeset**

`.changeset/scenes-pip-fullscreen.md`:

```md
---
"@karnstack/kino": minor
---

Scenes: document picture-in-picture (Chromium desktop, capability-gated via canPiP) and a pseudo-fullscreen fallback for browsers without Element.requestFullscreen (iPhone Safari and Chrome). kino:init gains an optional startTime for resume-after-reload; the host also accepts commands from the pip window's opener.
```

- [ ] **Step 3: Full gate + commit**

```bash
pnpm vitest run && pnpm build
git add demo/pages/providers.tsx .changeset/scenes-pip-fullscreen.md
git commit -m "docs(scenes): pip + mobile fullscreen notes, changeset"
```

---

## Verification after all tasks

1. `pnpm vitest run` green, `pnpm build` green, lint if present.
2. Demo smoke: `pnpm dev` in the kino repo, open the scenes demo page in desktop Chrome, click the pip button (trusted click required: use `reins cdp Input.dispatchMouseEvent`, not `reins click`). Verify: stage jumps to the pip window, placeholder shows inline, play/pause works from the pip overlay, close returns the stage and playback position survives both hops.
3. Push branch, open PR. Karn merges/publishes; iPhone fullscreen gets verified on a real device after release.
