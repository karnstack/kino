import { act } from "react"
import { createSceneHost, type SceneHostOptions } from "./host"
import type { SceneManifest } from "./protocol"

// React 19 requires this flag for act() outside testing-library.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// jsdom implements neither play(), pause(), nor load() on media elements,
// and has no ResizeObserver (the host observes the container for stage
// scaling).
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"))
      return Promise.resolve()
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"))
    },
  })
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value(this: HTMLMediaElement) {},
  })
})

// makeHost swaps window.parent.postMessage for a capturing stub; restore the
// real one after every test regardless of how the test exits.
const realParentPostMessage = window.parent.postMessage

afterEach(() => {
  window.parent.postMessage = realParentPostMessage
})

const manifest: SceneManifest = {
  version: 1,
  slug: "demo",
  duration: 12,
  scenes: [
    {
      id: "01",
      src: "/01.js",
      start: 0,
      end: 6,
      cues: { audioDuration: 5.5, cues: [{ id: "go", t: 1 }], words: [] },
    },
    {
      id: "02",
      src: "/02.js",
      start: 6,
      end: 12,
      cues: { audioDuration: 6, cues: [], words: [] },
    },
  ],
  audio: [{ bitrate: 128, src: "/audio.m4a" }],
}

const SceneOne = () => <div data-scene="01" />
const SceneTwo = () => <div data-scene="02" />

function makeHost(overrides?: Partial<SceneHostOptions>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const posted: unknown[] = []
  window.parent.postMessage = ((msg: unknown) =>
    posted.push(msg)) as typeof window.parent.postMessage
  let host: ReturnType<typeof createSceneHost>
  act(() => {
    host = createSceneHost({
      container,
      manifest,
      loadScene: (id) =>
        Promise.resolve({ default: id === "01" ? SceneOne : SceneTwo }),
      ...overrides,
    })
  })
  return {
    container,
    posted,
    host: host!,
    audio: () => container.querySelector("audio") as HTMLAudioElement,
  }
}

function command(data: unknown, origin?: string) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        source: window.parent,
        ...(origin === undefined ? {} : { origin }),
      }),
    )
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

test("host mounts audio element and posts ready with manifest duration", async () => {
  const h = makeHost()
  await flush()
  expect(h.audio()).toBeTruthy()
  expect(h.audio().getAttribute("src")).toBe("/audio.m4a")
  expect(h.posted).toContainEqual({ type: "kino:ready", duration: 12 })
  act(() => h.host.destroy())
})

test("host renders the scene owning currentTime and swaps at the boundary", async () => {
  const h = makeHost()
  await flush()
  expect(h.container.querySelector("[data-scene='01']")).toBeTruthy()
  act(() => {
    h.audio().currentTime = 7
    h.audio().dispatchEvent(new Event("timeupdate"))
  })
  await flush()
  expect(h.container.querySelector("[data-scene='02']")).toBeTruthy()
  expect(h.container.querySelector("[data-scene='01']")).toBe(null)
  expect(h.posted).toContainEqual({ type: "kino:scenechange", id: "02" })
  act(() => h.host.destroy())
})

test("play/pause/seek/rate commands drive the audio element", async () => {
  const h = makeHost()
  await flush()
  command({ type: "kino:play" })
  command({ type: "kino:setRate", rate: 1.5 })
  expect(h.audio().playbackRate).toBe(1.5)
  command({ type: "kino:seek", time: 3 })
  expect(h.audio().currentTime).toBe(3)
  command({ type: "kino:setMuted", muted: true })
  expect(h.audio().muted).toBe(true)
  act(() => h.host.destroy())
})

test("seek toggles onSeekingChange until the element settles", async () => {
  const calls: boolean[] = []
  const h = makeHost({ onSeekingChange: (s) => calls.push(s) })
  await flush()
  command({ type: "kino:seek", time: 3 })
  expect(calls).toEqual([true])
  act(() => {
    h.audio().dispatchEvent(new Event("seeked"))
  })
  expect(calls).toEqual([true, false])
  act(() => h.host.destroy())
})

test("messages not from the parent window are ignored", async () => {
  const h = makeHost()
  await flush()
  // In jsdom window.parent === window, so a foreign window needs a real
  // iframe; in a browser this models a message from any non-parent frame.
  const foreign = document.createElement("iframe")
  document.body.appendChild(foreign)
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "kino:seek", time: 9 },
        source: foreign.contentWindow,
      }),
    )
  })
  expect(h.audio().currentTime).toBe(0)
  foreign.remove()
  act(() => h.host.destroy())
})

test("with parentOrigin locked down, commands from other origins are ignored", async () => {
  const h = makeHost({ parentOrigin: "https://app.example.com" })
  await flush()
  // Parent source but wrong origin: dropped before any command handling.
  command({ type: "kino:seek", time: 3 }, "https://evil.example.com")
  expect(h.audio().currentTime).toBe(0)
  // Same command from the configured origin goes through.
  command({ type: "kino:seek", time: 3 }, "https://app.example.com")
  expect(h.audio().currentTime).toBe(3)
  act(() => h.host.destroy())
})

test("a persistently failing scene load posts kino:error once and never retries", async () => {
  let loads = 0
  const h = makeHost({
    loadScene: (id) => {
      if (id === "01") {
        loads++
        return Promise.reject(new Error("boom"))
      }
      return Promise.resolve({ default: SceneTwo })
    },
  })
  await flush()
  // Stage re-renders on every clock emit; each tick calls ensureLoaded again.
  for (let i = 0; i < 5; i++) {
    act(() => {
      h.audio().currentTime = 1 + i
      h.audio().dispatchEvent(new Event("timeupdate"))
    })
    await flush()
  }
  const errors = h.posted.filter(
    (m) => (m as { type?: string }).type === "kino:error",
  )
  expect(errors).toEqual([
    { type: "kino:error", code: "scene", message: "scene 01 failed to load" },
  ])
  expect(loads).toBe(1)
  act(() => h.host.destroy())
})

test("destroy unmounts and stops posting", async () => {
  const h = makeHost()
  await flush()
  act(() => h.host.destroy())
  expect(h.container.querySelector("audio")).toBe(null)
  const before = h.posted.length
  act(() => {
    h.audio()
  })
  expect(h.posted.length).toBe(before)
})
