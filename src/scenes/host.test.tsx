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
// real one after every test regardless of how the test exits. The host also
// writes theme state onto documentElement at startup; reset that so no test
// observes another test's theme.
const realParentPostMessage = window.parent.postMessage

afterEach(() => {
  window.parent.postMessage = realParentPostMessage
  document.documentElement.className = ""
  document.documentElement.style.colorScheme = ""
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
    audio: () => container.querySelector("video") as HTMLVideoElement,
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

// Advance the sequence clock exactly as the RAF loop would: set currentTime and
// emit the timeupdate the host listens on.
function tick(audio: HTMLVideoElement, t: number) {
  act(() => {
    audio.currentTime = t
    audio.dispatchEvent(new Event("timeupdate"))
  })
}

// jsdom's media stubs never flip `paused`, so model real playback by defining
// the property. The returned handle pauses the way the controls would: flip
// paused, then emit the pause event the host reacts to.
function playing(audio: HTMLVideoElement) {
  let paused = false
  Object.defineProperty(audio, "paused", {
    configurable: true,
    get: () => paused,
  })
  return {
    pause() {
      act(() => {
        paused = true
        audio.dispatchEvent(new Event("pause"))
      })
    },
  }
}

// The scene ids currently in the DOM, in document (paint) order.
function scenesInDom(container: HTMLElement) {
  return [...container.querySelectorAll("[data-scene]")].map((el) =>
    el.getAttribute("data-scene"),
  )
}

test("host mounts audio element and posts ready with manifest duration", async () => {
  const h = makeHost()
  await flush()
  expect(h.audio()).toBeTruthy()
  expect(h.audio().getAttribute("src")).toBe("/audio.m4a")
  // Without playsinline, iPhone WebKit promotes the clock element to the
  // native fullscreen player on play().
  expect(h.audio().hasAttribute("playsinline")).toBe(true)
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

test("a natural advance holds the outgoing scene over the incoming one", async () => {
  const h = makeHost()
  await flush()
  playing(h.audio())
  tick(h.audio(), 5.9)
  tick(h.audio(), 6.1)
  // Both scenes are mounted, the incoming one under the outgoing one so the
  // outgoing scene's settled frame paints last (on top).
  expect(scenesInDom(h.container)).toEqual(["02", "01"])
  // kino:scenechange still fires exactly once for the new scene: the outgoing
  // scene was reordered, not remounted.
  const changes = h.posted.filter(
    (m) => (m as { type?: string; id?: string }).type === "kino:scenechange",
  )
  expect(changes).toEqual([
    { type: "kino:scenechange", id: "01" },
    { type: "kino:scenechange", id: "02" },
  ])
  // Past the overlap window the held scene is gone.
  tick(h.audio(), 6.5)
  expect(h.container.querySelector("[data-scene='01']")).toBe(null)
  expect(h.container.querySelector("[data-scene='02']")).toBeTruthy()
  act(() => h.host.destroy())
})

test("a far seek past a boundary does not hold the previous scene", async () => {
  const h = makeHost()
  await flush()
  playing(h.audio())
  tick(h.audio(), 1)
  // delta from the boundary is 1s, well past the 0.5s natural-advance guard.
  tick(h.audio(), 7)
  expect(scenesInDom(h.container)).toEqual(["02"])
  act(() => h.host.destroy())
})

test("seeking back during the overlap window drops the held scene without duplicate keys", async () => {
  const h = makeHost()
  await flush()
  playing(h.audio())
  tick(h.audio(), 5.9)
  tick(h.audio(), 6.1)
  expect(scenesInDom(h.container)).toEqual(["02", "01"])
  // Seek back into the outgoing scene: it must not linger as an overlay next to
  // itself as the current scene.
  tick(h.audio(), 5.5)
  expect(scenesInDom(h.container)).toEqual(["01"])
  expect(h.container.querySelectorAll("[data-scene='01']").length).toBe(1)
  act(() => h.host.destroy())
})

test("pausing inside the overlap window clears the held scene", async () => {
  const h = makeHost()
  await flush()
  const play = playing(h.audio())
  tick(h.audio(), 5.9)
  tick(h.audio(), 6.1)
  expect(scenesInDom(h.container)).toEqual(["02", "01"])
  // A stuck overlay would freeze the outgoing frame on screen while paused.
  play.pause()
  expect(scenesInDom(h.container)).toEqual(["02"])
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
  expect(h.container.querySelector("video")).toBe(null)
  const before = h.posted.length
  act(() => {
    h.audio()
  })
  expect(h.posted.length).toBe(before)
})

test("init with startTime seeks the audio before playback", async () => {
  const h = makeHost()
  await flush()
  command({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: 7.5,
  })
  expect(h.audio().currentTime).toBe(7.5)
  act(() => h.host.destroy())
})

test("init startTime clamps to the sequence duration", async () => {
  const h = makeHost()
  await flush()
  command({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: 9999,
  })
  expect(h.audio().currentTime).toBe(manifest.duration)
  command({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    startTime: -3,
  })
  expect(h.audio().currentTime).toBe(0)
  act(() => h.host.destroy())
})

test("init autoPlay rejection is swallowed", async () => {
  const h = makeHost()
  await flush()
  // Reloaded pip iframes lack user activation, so play() rejects. A raw
  // descriptor override rather than vi.spyOn: vitest mocks track settled
  // results, which attaches a rejection handler to the returned promise and
  // would mask an unhandled rejection escaping the host.
  const original = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "play",
  )!
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value() {
      return Promise.reject(new DOMException("NotAllowedError"))
    },
  })
  try {
    command({
      type: "kino:init",
      rate: 1,
      volume: 1,
      muted: false,
      autoPlay: true,
    })
    // A macrotask hop lets any escaped rejection surface. No unhandled
    // rejection: reaching the end without vitest flagging one is the
    // assertion.
    await new Promise((r) => setTimeout(r, 0))
  } finally {
    Object.defineProperty(HTMLMediaElement.prototype, "play", original)
  }
  act(() => h.host.destroy())
})

test("commands from window.parent.opener are accepted", async () => {
  const h = makeHost()
  await flush()
  // In a document pip window the host's parent is the pip window and the
  // controlling document is that window's opener. jsdom cannot make a real
  // second Window, so a MessagePort stands in: any MessageEventSource works
  // for the identity check. Seek instead of pause because the jsdom media
  // stubs never flip `paused`, so currentTime is the observable effect.
  const port = new MessageChannel().port1
  Object.defineProperty(window, "opener", { value: port, configurable: true })
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "kino:seek", time: 9 },
        source: port,
      }),
    )
  })
  expect(h.audio().currentTime).toBe(9)
  Object.defineProperty(window, "opener", { value: null, configurable: true })
  act(() => h.host.destroy())
})

test("without a theme option the host applies dark", async () => {
  const h = makeHost()
  await flush()
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("dark")
  act(() => h.host.destroy())
})

test("theme: light option sets light, clears dark, sets colorScheme", async () => {
  // Host pages ship with class="dark" baked into the document; a light start
  // must clear it, not stack light next to it.
  document.documentElement.className = "dark"
  const h = makeHost({ theme: "light" })
  await flush()
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("light")
  act(() => h.host.destroy())
})

test("init carrying a theme applies it; init without one leaves it alone", async () => {
  const h = makeHost()
  await flush()
  command({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
    theme: "light",
  })
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  // A theme-less init (a host embedded by an older parent) must not reset the
  // theme back to dark.
  command({
    type: "kino:init",
    rate: 1,
    volume: 1,
    muted: false,
    autoPlay: false,
  })
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  act(() => h.host.destroy())
})

test("kino:setTheme flips the theme live; bogus values are ignored", async () => {
  const h = makeHost()
  await flush()
  command({ type: "kino:setTheme", theme: "light" })
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("light")
  command({ type: "kino:setTheme", theme: "dark" })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("dark")
  // Wire data is untyped; anything but the two literals is a no-op.
  command({ type: "kino:setTheme", theme: "solarized" })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
  expect(document.documentElement.style.colorScheme).toBe("dark")
  act(() => h.host.destroy())
})

test("commands from unrelated sources are still dropped", async () => {
  const h = makeHost()
  await flush()
  const stranger = new MessageChannel().port2
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "kino:seek", time: 9 },
        source: stranger,
      }),
    )
  })
  expect(h.audio().currentTime).toBe(0)
  act(() => h.host.destroy())
})
