import { createScenesProvider } from "./provider"
import { pipStageBackdrop } from "./pip-surfaces"
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
function snapshot(rate: number, currentTime = 0): HostEvent {
  return {
    type: "kino:state",
    state: {
      currentTime,
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
    theme: "dark",
  })
  p.destroy()
})

test("init carries the theme option; anything but light falls back to dark", () => {
  const p = createScenesProvider({ src: SRC, theme: "light" })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(posted).toContainEqual(
    expect.objectContaining({ type: "kino:init", theme: "light" }),
  )
  p.destroy()
})

// Until the host announces kino:ready the frame is still on its initial
// about:blank document, which inherits the embedding page's origin. A command
// targeted at the host origin is refused there ("The target origin provided
// does not match the recipient window's origin"), so nothing may go out early.
test("no command reaches the host frame before the ready handshake", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  p.setSceneTheme("light")
  p.actions.play()
  p.actions.seek(4)
  p.actions.setRate(1.5)
  p.actions.setVolume(0.5)
  p.actions.setMuted(true)
  expect(posted).toEqual([])
  // The dropped pre-ready settings are not lost: they ride the init reply.
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(posted).toContainEqual({
    type: "kino:init",
    rate: 1.5,
    volume: 0.5,
    muted: true,
    autoPlay: false,
    theme: "light",
  })
  p.destroy()
})

test("setSceneTheme posts kino:setTheme to the master", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.setSceneTheme("light")
  expect(posted).toContainEqual({ type: "kino:setTheme", theme: "light" })
  p.setSceneTheme("dark")
  expect(posted).toContainEqual({ type: "kino:setTheme", theme: "dark" })
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
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
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

// Stand-in for a document pip window. Reuses the main jsdom document so
// iframes appended to its body get live contentWindows (a detached document
// would null them, which real Chrome does not do). The mirror iframe the
// provider creates therefore lands as a direct child of document.body,
// distinguishable from the master iframe inside its host container.
// EventTarget covers addEventListener for "message" and "pagehide".
class FakePipWindow extends EventTarget {
  document = window.document
  closed = false
  close() {
    if (this.closed) return
    this.closed = true
    this.dispatchEvent(new Event("pagehide"))
  }
}

// The mirror is the only iframe that is a direct child of document.body; the
// master lives inside the host div created by mount().
function findMirror(): HTMLIFrameElement | null {
  return document.body.querySelector(":scope > iframe")
}

// Simulate a message from the mirror host: it posts to its window.parent,
// which is the pip window, so the provider listens there.
function fromMirror(
  fake: FakePipWindow,
  mirror: HTMLIFrameElement,
  data: HostEvent,
) {
  fake.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: "https://scenes.example.com",
      source: mirror.contentWindow,
    }),
  )
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

test("enterPiP keeps the master home and playing, and mounts a mirror in the pip window", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, snapshot(1)) // playing at currentTime 0 per the helper
  p.actions.seek(12)
  const masterPost = vi.spyOn(iframe.contentWindow!, "postMessage")
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  // The master never moves and its playback state is untouched: no pause,
  // no re-init, no reload.
  expect(iframe.parentElement).toBe(host)
  expect(p.getState().paused).toBe(false)
  expect(p.getState().currentTime).toBe(12)
  const masterCmds = masterPost.mock.calls.map(
    (c) => (c[0] as { type: string }).type,
  )
  expect(masterCmds).not.toContain("kino:pause")
  expect(masterCmds).not.toContain("kino:init")
  // A mirror iframe sits in the pip body with autoplay delegation.
  const mirror = findMirror()
  expect(mirror).not.toBeNull()
  expect(mirror!.src).toBe(SRC)
  expect(mirror!.getAttribute("allow")).toContain("autoplay")
  expect(host.querySelector(".kino-pip-placeholder")).not.toBeNull()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).not.toBeNull()
  // Standards-mode pip documents have auto-height bodies; without these the
  // percentage-height mirror collapses to 150px.
  expect(fake.document.documentElement.style.height).toBe("100%")
  expect(fake.document.body.style.height).toBe("100%")
  p.destroy()
  uninstall()
})

test("mirror ready gets a muted init at the master clock", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC, defaultRate: 1.5 })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, snapshot(1.5)) // playing
  p.actions.seek(12)
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const init = mirrorPost.mock.calls
    .map((c) => c[0])
    .find((m) => (m as { type: string }).type === "kino:init")
  expect(init).toEqual({
    type: "kino:init",
    rate: 1.5,
    volume: 0,
    muted: true,
    autoPlay: true,
    startTime: 12,
    theme: "dark",
  })
  p.destroy()
  uninstall()
})

test("a paused master yields a mirror init with autoPlay false", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  // Never played: defaultState is paused at 0.
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const init = mirrorPost.mock.calls
    .map((c) => c[0])
    .find((m) => (m as { type: string }).type === "kino:init")
  expect(init).toEqual({
    type: "kino:init",
    rate: 1,
    volume: 0,
    muted: true,
    autoPlay: false,
    startTime: 0,
    theme: "dark",
  })
  p.destroy()
  uninstall()
})

test("mirror init carries the current theme, not the mount-time one", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  // The theme flipped after mount; a mirror created later must come up in it.
  p.setSceneTheme("light")
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const init = mirrorPost.mock.calls
    .map((c) => c[0])
    .find((m) => (m as { type: string }).type === "kino:init")
  expect(init).toMatchObject({ theme: "light" })
  p.destroy()
  uninstall()
})

// Same about:blank rule as the master: a mirror created in the pip window is
// on the pip document's origin until it loads, so nothing may be posted at the
// host origin before its own ready handshake.
test("no command reaches the mirror before its ready handshake", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  p.actions.play()
  p.actions.seek(9)
  p.setSceneTheme("light")
  expect(mirrorPost).not.toHaveBeenCalled()
  // The mirror comes up on the master's clock and theme regardless.
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  expect(mirrorPost.mock.calls.map((c) => c[0])).toContainEqual(
    expect.objectContaining({
      type: "kino:init",
      startTime: 9,
      theme: "light",
    }),
  )
  p.destroy()
  uninstall()
})

test("setSceneTheme fans out to the mirror while in pip", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  const masterPost = vi.spyOn(iframe.contentWindow!, "postMessage")
  p.setSceneTheme("light")
  expect(mirrorPost.mock.calls.map((c) => c[0])).toContainEqual({
    type: "kino:setTheme",
    theme: "light",
  })
  expect(masterPost.mock.calls.map((c) => c[0])).toContainEqual({
    type: "kino:setTheme",
    theme: "light",
  })
  p.destroy()
  uninstall()
})

// jsdom rewrites color syntax on assignment (oklch percentages become
// decimals), so compare against what the same value becomes in a style prop.
function asStyleValue(background: string): string {
  const probe = document.createElement("div")
  probe.style.background = background
  return probe.style.background
}

test("the pip window backdrop follows the stage theme, live", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC, theme: "light" })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  // A hardcoded black body flashed black behind a light stage before the
  // mirror painted, the same defect the in-page placeholder had.
  expect(fake.document.body.style.background).toBe(
    asStyleValue(pipStageBackdrop("light")),
  )
  expect(fake.document.documentElement.style.colorScheme).toBe("light")
  p.setSceneTheme("dark")
  expect(fake.document.body.style.background).toBe(
    asStyleValue(pipStageBackdrop("dark")),
  )
  expect(fake.document.documentElement.style.colorScheme).toBe("dark")
  p.destroy()
  uninstall()
})

test("chromeTheme themes the pip overlay and setChromeTheme flips it live", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC, chromeTheme: "light" })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const overlay = document.body.querySelector(
    "[data-kino-pip-overlay]",
  ) as HTMLElement
  expect(overlay.getAttribute("data-kino-theme")).toBe("light")
  p.setChromeTheme("dark")
  expect(overlay.getAttribute("data-kino-theme")).toBe("dark")
  p.destroy()
  uninstall()
})

test("a chrome flip outside pip seeds the next pip window", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.setChromeTheme("light")
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  expect(
    document.body
      .querySelector("[data-kino-pip-overlay]")!
      .getAttribute("data-kino-theme"),
  ).toBe("light")
  p.destroy()
  uninstall()
})

test("mirror state feeds drift correction only, never MediaState", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, snapshot(1, 12))
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  // The mirror reports its own clock; MediaState stays on the master's.
  fromMirror(fake, mirror, snapshot(1, 5))
  expect(p.getState().currentTime).toBe(12)
  // Master within 0.3s of the mirror: no correction.
  fromHost(iframe, snapshot(1, 5.2))
  expect(
    mirrorPost.mock.calls.map((c) => (c[0] as { type: string }).type),
  ).not.toContain("kino:seek")
  // Drifted past 0.3s: the mirror is seeked to the master time.
  fromHost(iframe, snapshot(1, 6))
  expect(mirrorPost.mock.calls.map((c) => c[0])).toContainEqual({
    type: "kino:seek",
    time: 6,
  })
  p.destroy()
  uninstall()
})

test("transport commands fan out to the mirror while in pip, volume commands never", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  const mirror = findMirror()!
  fromMirror(fake, mirror, { type: "kino:ready", duration: 40.5 })
  const mirrorPost = vi.spyOn(mirror.contentWindow!, "postMessage")
  p.actions.play()
  p.actions.pause()
  p.actions.seek(21)
  p.actions.setRate(2)
  p.actions.setVolume(0.5)
  p.actions.setMuted(false)
  const cmds = mirrorPost.mock.calls.map((c) => c[0])
  expect(cmds).toContainEqual({ type: "kino:play" })
  expect(cmds).toContainEqual({ type: "kino:pause" })
  expect(cmds).toContainEqual({ type: "kino:seek", time: 21 })
  expect(cmds).toContainEqual({ type: "kino:setRate", rate: 2 })
  const types = cmds.map((c) => (c as { type: string }).type)
  expect(types).not.toContain("kino:setVolume")
  expect(types).not.toContain("kino:setMuted")
  // After exit nothing reaches the mirror anymore.
  p.actions.exitPiP()
  mirrorPost.mockClear()
  p.actions.play()
  p.actions.seek(30)
  expect(mirrorPost).not.toHaveBeenCalled()
  p.destroy()
  uninstall()
})

test("pip window close removes the mirror and clears pip state; the master never moved", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, snapshot(1, 12))
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  p.actions.exitPiP()
  expect(p.getState().pip).toBe(false)
  expect(iframe.parentElement).toBe(host)
  expect(p.getState().currentTime).toBe(12)
  expect(findMirror()).toBeNull()
  expect(host.querySelector(".kino-pip-placeholder")).toBeNull()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
  p.destroy()
  uninstall()
})

test("destroy while in pip closes the pip window and removes the mirror", async () => {
  const fake = new FakePipWindow()
  const uninstall = installFakeDocumentPiP(fake)
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  p.actions.enterPiP()
  await vi.waitFor(() => expect(p.getState().pip).toBe(true))
  p.destroy()
  expect(fake.closed).toBe(true)
  expect(findMirror()).toBeNull()
  uninstall()
})

test("requestWindow rejection leaves state untouched and creates no mirror", async () => {
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: { requestWindow: vi.fn().mockRejectedValue(new Error("denied")) },
  })
  const p = createScenesProvider({ src: SRC })
  const { host, iframe } = mount(p)
  p.actions.enterPiP()
  await Promise.resolve()
  await Promise.resolve()
  expect(p.getState().pip).toBe(false)
  expect(iframe.parentElement).toBe(host)
  expect(findMirror()).toBeNull()
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
  // Exactly one mirror and one set of surfaces was wired; a single close
  // removes everything.
  expect(document.body.querySelectorAll(":scope > iframe")).toHaveLength(1)
  p.actions.exitPiP()
  expect(p.getState().pip).toBe(false)
  expect(iframe.parentElement).toBe(host)
  expect(findMirror()).toBeNull()
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
  expect(findMirror()).toBeNull()
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

// ---------------------------------------------------------------------------
// Ambient first-load preview
// ---------------------------------------------------------------------------

const PREVIEW = { endSeconds: 20, cycles: 2 }

// A host snapshot for the preview loop: playing, at `currentTime`.
function playingAt(currentTime: number): HostEvent {
  return {
    type: "kino:state",
    state: {
      currentTime,
      duration: 40.5,
      paused: false,
      buffered: [[0, 20]],
      seeking: false,
      ended: false,
      rate: 1,
      volume: 1,
      muted: true,
      readyState: 4,
    },
  }
}

// Bring a provider up to the point where the muted loop is running, and hand
// back the command log with the handshake traffic already dropped.
function mountPreviewing(
  options: Partial<Parameters<typeof createScenesProvider>[0]> = {},
) {
  const p = createScenesProvider({ src: SRC, preview: PREVIEW, ...options })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  return { p, iframe, posted }
}

test("without the preview option the handshake starts nothing", () => {
  const p = createScenesProvider({ src: SRC })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(posted).toEqual([
    expect.objectContaining({ type: "kino:init", autoPlay: false }),
  ])
  p.destroy()
})

test("preview starts the loop muted, and mutes before it plays", () => {
  const { p, posted } = mountPreviewing()
  expect(posted).toContainEqual({ type: "kino:setMuted", muted: true })
  expect(posted).toContainEqual({ type: "kino:seek", time: 0 })
  expect(posted).toContainEqual({ type: "kino:play" })
  // Muted-autoplay policy only exempts a player that is already muted.
  const muteAt = posted.findIndex(
    (m) => (m as { type: string }).type === "kino:setMuted",
  )
  const playAt = posted.findIndex(
    (m) => (m as { type: string }).type === "kino:play",
  )
  expect(muteAt).toBeLessThan(playAt)
  p.destroy()
})

test("the loop never reaches MediaState: the player keeps reading idle", () => {
  const { p, iframe } = mountPreviewing()
  fromHost(iframe, playingAt(7.5))
  const s = p.getState()
  // Exactly the shape IdleOverlay, ControlBar and Captions gate on.
  expect(s.paused).toBe(true)
  expect(s.currentTime).toBe(0)
  expect(s.ended).toBe(false)
  // The viewer's own audio settings, not the loop's.
  expect(s.muted).toBe(false)
  // Loading progress is not clock state, so it still flows: cross-lesson
  // autoplay arms on the readyState edge.
  expect(s.readyState).toBe(4)
  expect(s.buffered).toEqual([[0, 20]])
  p.destroy()
})

test("no caption fires while the preview runs", () => {
  const { p, iframe } = mountPreviewing({
    captions: {
      src: "https://scenes.example.com/c.vtt",
      label: "en",
      srclang: "en",
    },
  })
  p.actions.setTextTrack("captions")
  fromHost(iframe, playingAt(7.5))
  expect(p.getState().activeCueText).toBe("")
  p.destroy()
})

test("the window loops `cycles` times, then settles on the held frame", () => {
  const { p, iframe, posted } = mountPreviewing()
  const seeks = () =>
    posted.filter((m) => (m as { type: string }).type === "kino:seek")

  fromHost(iframe, playingAt(19.9))
  expect(seeks()).toHaveLength(1) // just the start-of-loop seek

  fromHost(iframe, playingAt(20.1))
  expect(seeks()).toEqual([
    { type: "kino:seek", time: 0 },
    { type: "kino:seek", time: 0 },
  ])

  fromHost(iframe, playingAt(3))
  fromHost(iframe, playingAt(20.2))
  // Last cycle spent: pause on the opening scene's settled final frame.
  expect(posted).toContainEqual({ type: "kino:pause" })
  expect(seeks().at(-1)).toEqual({ type: "kino:seek", time: 20 - 0.15 })
  // Still idle to everyone watching.
  expect(p.getState().paused).toBe(true)
  expect(p.getState().currentTime).toBe(0)
  p.destroy()
})

test("a snapshot queued before the loop seek cannot burn a second cycle", () => {
  const { p, iframe, posted } = mountPreviewing()
  fromHost(iframe, playingAt(20.1))
  // Same boundary again: the host had this in flight before our seek landed.
  fromHost(iframe, playingAt(20.15))
  expect(posted).not.toContainEqual({ type: "kino:pause" })
  fromHost(iframe, playingAt(1))
  fromHost(iframe, playingAt(20.2))
  expect(posted).toContainEqual({ type: "kino:pause" })
  p.destroy()
})

test("play() hands the clock back at the top with the viewer's audio", () => {
  const { p, iframe, posted } = mountPreviewing()
  fromHost(iframe, playingAt(12))
  posted.length = 0
  p.actions.play()
  expect(posted).toEqual([
    { type: "kino:pause" },
    { type: "kino:seek", time: 0 },
    { type: "kino:setMuted", muted: false },
    { type: "kino:setVolume", volume: 1 },
    { type: "kino:setRate", rate: 1 },
    { type: "kino:play" },
  ])
  // And the host is authoritative again.
  fromHost(iframe, snapshot(1, 0.4))
  expect(p.getState().currentTime).toBe(0.4)
  expect(p.getState().paused).toBe(false)
  p.destroy()
})

test("play() after the preview settled still starts from the top", () => {
  const { p, iframe, posted } = mountPreviewing({
    preview: { endSeconds: 20, cycles: 1 },
  })
  fromHost(iframe, playingAt(20.1))
  posted.length = 0
  p.actions.play()
  expect(posted).toContainEqual({ type: "kino:seek", time: 0 })
  p.destroy()
})

test("a stale snapshot after the hand-back is dropped, not flashed", () => {
  const { p, iframe } = mountPreviewing()
  fromHost(iframe, playingAt(12))
  p.actions.play()
  // Queued by the host before our seek landed; it still carries the loop clock.
  fromHost(iframe, snapshot(1, 12.1))
  expect(p.getState().currentTime).toBe(0)
  // The host agreeing releases the guard.
  fromHost(iframe, snapshot(1, 0.2))
  expect(p.getState().currentTime).toBe(0.2)
  p.destroy()
})

test("seek() hands the clock back at the requested time", () => {
  const { p, iframe, posted } = mountPreviewing()
  fromHost(iframe, playingAt(12))
  posted.length = 0
  p.actions.seek(300)
  expect(posted).toContainEqual({ type: "kino:setMuted", muted: false })
  expect(
    posted.filter((m) => (m as { type: string }).type === "kino:seek"),
  ).toEqual([
    { type: "kino:seek", time: 300 },
    { type: "kino:seek", time: 300 },
  ])
  expect(p.getState().currentTime).toBe(300)
  p.destroy()
})

test("setRate holds the preview: the chips set a speed, then play", () => {
  const { p, iframe, posted } = mountPreviewing()
  fromHost(iframe, playingAt(5))
  posted.length = 0
  p.actions.setRate(2.5)
  // Nothing posted: speeding the muted loop under the viewer only looks broken.
  expect(posted).toEqual([])
  expect(p.getState().rate).toBe(2.5)
  // The chosen rate rides the hand-back instead.
  p.actions.play()
  expect(posted).toContainEqual({ type: "kino:setRate", rate: 2.5 })
  p.destroy()
})

test("refused muted autoplay settles on the held frame after the grace", () => {
  vi.useFakeTimers()
  const p = createScenesProvider({ src: SRC, preview: PREVIEW })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  // iOS low power mode: play() rejected, so the clock never moves.
  vi.advanceTimersByTime(900)
  expect(posted).toContainEqual({ type: "kino:pause" })
  expect(posted).toContainEqual({ type: "kino:seek", time: 20 - 0.15 })
  expect(p.getState().paused).toBe(true)
  p.destroy()
  vi.useRealTimers()
})

test("a rolling loop is never settled by the grace timer", () => {
  vi.useFakeTimers()
  const p = createScenesProvider({ src: SRC, preview: PREVIEW })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  fromHost(iframe, playingAt(0.3))
  vi.advanceTimersByTime(900)
  expect(posted).not.toContainEqual({ type: "kino:pause" })
  p.destroy()
  vi.useRealTimers()
})

test("autoPlay wins over preview: nothing is teased", () => {
  const p = createScenesProvider({ src: SRC, preview: PREVIEW, autoPlay: true })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(posted).toEqual([
    expect.objectContaining({
      type: "kino:init",
      autoPlay: true,
      muted: false,
    }),
  ])
  p.destroy()
})

test("a window too short to settle inside is no preview at all", () => {
  const p = createScenesProvider({ src: SRC, preview: { endSeconds: 0.1 } })
  const { iframe } = mount(p)
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  fromHost(iframe, { type: "kino:ready", duration: 40.5 })
  expect(posted).toHaveLength(1)
  p.destroy()
})

test("prefers-reduced-motion suppresses the preview", () => {
  const original = window.matchMedia
  window.matchMedia = ((q: string) => ({
    matches: q.includes("prefers-reduced-motion"),
  })) as typeof window.matchMedia
  const { p, posted } = mountPreviewing()
  expect(posted).toHaveLength(1)
  p.destroy()
  window.matchMedia = original
})

test("save-data suppresses the preview", () => {
  Object.defineProperty(navigator, "connection", {
    value: { saveData: true },
    configurable: true,
  })
  const { p, posted } = mountPreviewing()
  expect(posted).toHaveLength(1)
  p.destroy()
  Reflect.deleteProperty(navigator, "connection")
})

test("an offscreen player defers the preview until it scrolls into view", () => {
  let fire: ((entries: Array<{ isIntersecting: boolean }>) => void) | null =
    null
  const disconnect = vi.fn()
  class FakeObserver {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      fire = cb
    }
    observe() {}
    disconnect = disconnect
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  const { p, posted } = mountPreviewing()
  // Below the fold: both loops would be spent unwatched.
  expect(posted).toHaveLength(1)
  fire!([{ isIntersecting: true }])
  expect(posted).toContainEqual({ type: "kino:play" })
  expect(disconnect).toHaveBeenCalled()
  p.destroy()
  vi.unstubAllGlobals()
})

test("destroy tears down a preview that never started", () => {
  let fire: ((entries: Array<{ isIntersecting: boolean }>) => void) | null =
    null
  const disconnect = vi.fn()
  class FakeObserver {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      fire = cb
    }
    observe() {}
    disconnect = disconnect
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  const { p, posted } = mountPreviewing()
  p.destroy()
  expect(disconnect).toHaveBeenCalled()
  fire!([{ isIntersecting: true }])
  expect(posted).toHaveLength(1)
  vi.unstubAllGlobals()
})

test("the loop always runs at 1x, whatever speed the viewer watches at", () => {
  const { p, iframe, posted } = mountPreviewing({ defaultRate: 2.5 })
  // The viewer's speed is how fast they want to learn, not how fast a teaser
  // should move.
  expect(posted).toContainEqual({ type: "kino:setRate", rate: 1 })
  fromHost(iframe, playingAt(5))
  posted.length = 0
  // It comes back on the hand-back, not before.
  p.actions.play()
  expect(posted).toContainEqual({ type: "kino:setRate", rate: 2.5 })
  expect(p.getState().rate).toBe(2.5)
  p.destroy()
})
