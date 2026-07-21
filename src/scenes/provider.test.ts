import { createScenesProvider } from "./provider"
import type { HostEvent } from "./protocol"

function mount(p: ReturnType<typeof createScenesProvider>) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  p.mount(host)
  const iframe = host.querySelector("iframe") as HTMLIFrameElement
  return { host, iframe }
}

// Simulate a message arriving from the host iframe. jsdom lets us construct
// MessageEvent with an explicit source so the provider's origin/source
// filtering passes.
function fromHost(iframe: HTMLIFrameElement, data: HostEvent) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: "https://scenes.example.com",
      source: iframe.contentWindow,
    }),
  )
}

const SRC = "https://scenes.example.com/l/demo?token=abc"

// A full host snapshot with the rate under test; other fields are inert.
function snapshot(rate: number): HostEvent {
  return {
    type: "kino:state",
    state: {
      currentTime: 0,
      duration: 40.5,
      paused: false,
      buffered: [],
      seeking: false,
      ended: false,
      rate,
      volume: 1,
      muted: false,
      readyState: 4,
    },
  }
}

test("mount creates an iframe with autoplay/fullscreen delegation", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  expect(iframe.src).toBe(SRC)
  expect(iframe.getAttribute("allow")).toContain("autoplay")
  expect(iframe.getAttribute("allow")).toContain("fullscreen")
  p.destroy()
})

test("capabilities: rate yes, quality/storyboard/pip no, captions when provided", () => {
  const p = createScenesProvider({ src: SRC })
  const caps = p.getState().capabilities
  expect(caps.canSetRate).toBe(true)
  expect(caps.canSetQuality).toBe(false)
  expect(caps.hasStoryboard).toBe(false)
  expect(caps.canPiP).toBe(false)
  expect(caps.hasTextTracks).toBe(false)
  p.destroy()
  const p2 = createScenesProvider({
    src: SRC,
    captions: {
      src: "https://scenes.example.com/l/demo/captions.vtt",
      label: "English",
      srclang: "en",
    },
  })
  expect(p2.getState().capabilities.hasTextTracks).toBe(true)
  p2.destroy()
})

test("storyboard option reports the capability and exposes the vtt url", () => {
  const vttUrl = "https://scenes.example.com/l/demo/storyboard.vtt?token=abc"
  const p = createScenesProvider({ src: SRC, storyboard: { vttUrl } })
  const s = p.getState()
  expect(s.capabilities.hasStoryboard).toBe(true)
  expect(s.storyboard).toEqual({ vttUrl })
  p.destroy()
})

test("without a storyboard option the capability is off and state is null", () => {
  const p = createScenesProvider({ src: SRC })
  expect(p.getState().capabilities.hasStoryboard).toBe(false)
  expect(p.getState().storyboard).toBe(null)
  p.destroy()
})

test("ready handshake replies with init carrying rate and autoplay", () => {
  const p = createScenesProvider({ src: SRC, defaultRate: 1.5, autoPlay: true })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(p.getState().duration).toBe(40.5)
  expect(posted).toContainEqual({
    type: "kino:init",
    rate: 1.5,
    volume: 1,
    muted: false,
    autoPlay: true,
  })
  p.destroy()
})

test("state events patch MediaState and notify subscribers", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  let notified = 0
  p.subscribe(() => notified++)
  fromHost(iframe, {
    type: "kino:state",
    state: {
      currentTime: 12.5,
      duration: 40.5,
      paused: false,
      buffered: [[0, 40.5]],
      seeking: false,
      ended: false,
      rate: 1.5,
      volume: 0.8,
      muted: false,
      readyState: 4,
    },
  })
  const s = p.getState()
  expect(s.currentTime).toBe(12.5)
  expect(s.paused).toBe(false)
  expect(s.rate).toBe(1.5)
  expect(notified).toBeGreaterThan(0)
  p.destroy()
})

test("messages from other sources or origins are ignored", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "kino:state", state: { currentTime: 99 } },
      origin: "https://evil.example.com",
      source: iframe.contentWindow,
    }),
  )
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "kino:state", state: { currentTime: 99 } },
      origin: "https://scenes.example.com",
      source: window,
    }),
  )
  expect(p.getState().currentTime).toBe(0)
  p.destroy()
})

test("actions post protocol commands to the host", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  p.actions.play()
  p.actions.seek(21)
  p.actions.setRate(2)
  p.actions.setMuted(true)
  expect(posted).toContainEqual({ type: "kino:play" })
  expect(posted).toContainEqual({ type: "kino:seek", time: 21 })
  expect(posted).toContainEqual({ type: "kino:setRate", rate: 2 })
  expect(posted).toContainEqual({ type: "kino:setMuted", muted: true })
  // setRate reflects immediately so the speed menu doesn't flicker.
  expect(p.getState().rate).toBe(2)
  p.destroy()
})

test("a stale snapshot cannot revert an in-flight setRate", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  p.actions.setRate(2)
  expect(p.getState().rate).toBe(2)
  // Snapshot taken before the setRate command landed in the host.
  fromHost(iframe, snapshot(1))
  expect(p.getState().rate).toBe(2)
  // The host echoes the new rate back: the hold clears.
  fromHost(iframe, snapshot(2))
  expect(p.getState().rate).toBe(2)
  // Later host-driven rate changes flow through untouched again.
  fromHost(iframe, snapshot(1.25))
  expect(p.getState().rate).toBe(1.25)
  p.destroy()
})

test("host errors carry the string code bracketed into the message", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, {
    type: "kino:error",
    code: "scene",
    message: "scene 01 failed to load",
  })
  expect(p.getState().error).toEqual({
    code: 0,
    message: "[scene] scene 01 failed to load",
  })
  p.destroy()
})

test("captions: setTextTrack toggles and active cue text follows currentTime", async () => {
  const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nOne server.\n"
  const realFetch = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response(vtt))) as typeof fetch
  try {
    const p = createScenesProvider({
      src: SRC,
      captions: {
        src: "https://scenes.example.com/captions.vtt",
        label: "English",
        srclang: "en",
      },
    })
    const { iframe } = mount(p)
    // Let the fetch/parse microtasks flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(p.getState().textTracks).toHaveLength(1)
    p.actions.setTextTrack("captions")
    fromHost(iframe, {
      type: "kino:state",
      state: {
        currentTime: 2,
        duration: 40.5,
        paused: false,
        buffered: [],
        seeking: false,
        ended: false,
        rate: 1,
        volume: 1,
        muted: false,
        readyState: 4,
      },
    })
    expect(p.getState().activeCueText).toBe("One server.")
    p.actions.setTextTrack(null)
    expect(p.getState().activeCueText).toBe("")
    p.destroy()
  } finally {
    globalThis.fetch = realFetch
  }
})

test("destroy removes the iframe and stops listening", () => {
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  p.destroy()
  expect(host.querySelector("iframe")).toBe(null)
  // No throw when a late message arrives after destroy.
  fromHost(iframe, { type: "kino:ready", duration: 1 })
})

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
  ;(
    wrapper as HTMLElement & { requestFullscreen: () => Promise<void> }
  ).requestFullscreen = request
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
  // Standards-mode pip documents have auto-height bodies; without these the
  // percentage-height iframe collapses to 150px.
  expect(fake.document.documentElement.style.height).toBe("100%")
  expect(fake.document.body.style.height).toBe("100%")
  // The reloaded iframe announces ready again; the provider must resume.
  const post = vi.spyOn(iframe.contentWindow!, "postMessage")
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  const init = post.mock.calls
    .map(
      (c) => c[0] as { type: string; startTime?: number; autoPlay?: boolean },
    )
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
  const { iframe } = mount(p)
  p.actions.enterPiP()
  await Promise.resolve()
  await Promise.resolve()
  expect(p.getState().pip).toBe(false)
  // The rejected attempt must also drop its resume point: the next ready
  // handshake gets a plain init with no startTime.
  const post = vi.spyOn(iframe.contentWindow!, "postMessage")
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  const init = post.mock.calls
    .map((c) => c[0] as { type: string; startTime?: number })
    .find((m) => m.type === "kino:init")
  expect(init).toBeDefined()
  expect(init?.startTime).toBeUndefined()
  p.destroy()
  delete (window as { documentPictureInPicture?: unknown })
    .documentPictureInPicture
})

// Fake pip API whose requestWindow stays pending until the test resolves it,
// for racing enterPiP against other calls.
function installPendingDocumentPiP() {
  let resolveWindow!: (w: FakePipWindow) => void
  const requestWindow = vi.fn().mockImplementation(
    () =>
      new Promise<FakePipWindow>((r) => {
        resolveWindow = r
      }),
  )
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: { requestWindow },
  })
  return {
    requestWindow,
    resolve: (w: FakePipWindow) => resolveWindow(w),
    uninstall: () => {
      delete (window as { documentPictureInPicture?: unknown })
        .documentPictureInPicture
    },
  }
}

test("a second enterPiP while requestWindow is pending is ignored", async () => {
  const fake = new FakePipWindow()
  const pending = installPendingDocumentPiP()
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  p.actions.enterPiP()
  expect(pending.requestWindow).toHaveBeenCalledOnce()
  pending.resolve(fake)
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  // Exactly one set of surfaces was wired; a single close removes everything.
  p.actions.exitPiP()
  expect(p.getState().pip).toBe(false)
  expect(iframe.parentElement).toBe(host)
  expect(host.querySelector(".kino-pip-placeholder")).toBeNull()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
  p.destroy()
  pending.uninstall()
})

test("destroy while requestWindow is pending closes the late window", async () => {
  const fake = new FakePipWindow()
  const pending = installPendingDocumentPiP()
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  p.destroy()
  pending.resolve(fake)
  // The window arrives on a dead provider: it must be closed, not wired.
  await vi.waitFor(() => expect(fake.closed).toBe(true))
  expect(p.getState().pip).toBe(false)
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
  pending.uninstall()
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
