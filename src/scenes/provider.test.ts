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
