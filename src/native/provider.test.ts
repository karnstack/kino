import { createNativeProvider } from "./provider"

function mount(provider: ReturnType<typeof createNativeProvider>) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  provider.mount(host)
  const el = host.querySelector("video") as HTMLVideoElement
  return { host, el }
}

test("initial state defaults paused with auto quality and given rate", () => {
  const p = createNativeProvider({ src: "clip.mp4", defaultRate: 1.5 })
  const s = p.getState()
  expect(s.paused).toBe(true)
  expect(s.activeQualityId).toBe("auto")
  expect(s.rate).toBe(1.5)
  p.destroy()
})

test("capabilities: no quality switching, no storyboard on a raw file", () => {
  const p = createNativeProvider({ src: "clip.mp4" })
  const caps = p.getState().capabilities
  expect(caps.canSetQuality).toBe(false)
  expect(caps.hasStoryboard).toBe(false)
  expect(caps.canSetRate).toBe(true)
  expect(caps.hasTextTracks).toBe(false)
  p.destroy()
})

test("hasTextTracks capability is on when caption tracks are supplied", () => {
  const p = createNativeProvider({
    src: "clip.mp4",
    tracks: [{ src: "en.vtt", srclang: "en", label: "English" }],
  })
  expect(p.getState().capabilities.hasTextTracks).toBe(true)
  p.destroy()
})

test("mount creates a <video> with src, poster, and inline playback attrs", () => {
  const p = createNativeProvider({
    src: "clip.mp4",
    poster: "poster.jpg",
    muted: true,
    loop: true,
  })
  const { el } = mount(p)
  expect(el).toBeTruthy()
  expect(el.getAttribute("src")).toBe("clip.mp4")
  expect(el.getAttribute("poster")).toBe("poster.jpg")
  expect(el.hasAttribute("playsinline")).toBe(true)
  expect(el.muted).toBe(true)
  expect(el.loop).toBe(true)
  p.destroy()
})

test("mount appends a <track> for each supplied caption track", () => {
  const p = createNativeProvider({
    src: "clip.mp4",
    tracks: [
      { src: "en.vtt", srclang: "en", label: "English", default: true },
      { src: "fr.vtt", srclang: "fr", label: "Français", kind: "captions" },
    ],
  })
  const { el } = mount(p)
  const tracks = el.querySelectorAll("track")
  expect(tracks.length).toBe(2)
  expect(tracks[0]!.getAttribute("srclang")).toBe("en")
  expect(tracks[0]!.getAttribute("kind")).toBe("subtitles")
  expect(tracks[1]!.getAttribute("kind")).toBe("captions")
  p.destroy()
})

test("a default track becomes the active text track on mount", () => {
  const p = createNativeProvider({
    src: "clip.mp4",
    tracks: [
      { src: "en.vtt", srclang: "en", label: "English" },
      { src: "fr.vtt", srclang: "fr", label: "Français", default: true },
    ],
  })
  mount(p)
  expect(p.getState().activeTextTrackId).toBe("kino-track-1")
  p.destroy()
})

test("no active text track when none is marked default", () => {
  const p = createNativeProvider({
    src: "clip.mp4",
    tracks: [{ src: "en.vtt", srclang: "en", label: "English" }],
  })
  mount(p)
  expect(p.getState().activeTextTrackId).toBeNull()
  p.destroy()
})

test("playback rate survives a source swap", () => {
  const p = createNativeProvider({ src: "first.mp4" })
  const { el } = mount(p)
  p.actions.setRate(2)
  p.swapSource?.({ src: "second.mp4" })
  expect(el.playbackRate).toBe(2)
  expect(p.getState().rate).toBe(2)
  p.destroy()
})

test("setRate reflects immediately in state", () => {
  const p = createNativeProvider({ src: "clip.mp4" })
  mount(p)
  p.actions.setRate(2)
  expect(p.getState().rate).toBe(2)
  p.destroy()
})

test("setQuality is a no-op for a raw file (stays auto)", () => {
  const p = createNativeProvider({ src: "clip.mp4" })
  mount(p)
  p.actions.setQuality("anything")
  expect(p.getState().activeQualityId).toBe("auto")
  p.destroy()
})

test("subscribe is notified on state change", () => {
  const p = createNativeProvider({ src: "clip.mp4" })
  mount(p)
  let calls = 0
  const off = p.subscribe(() => calls++)
  p.actions.setRate(0.5)
  expect(calls).toBeGreaterThan(0)
  off()
  p.destroy()
})

test("swapSource swaps the element src and resets progress", () => {
  const p = createNativeProvider({ src: "first.mp4" })
  const { el } = mount(p)
  p.swapSource?.({ src: "second.mp4", poster: "next.jpg" })
  expect(el.getAttribute("src")).toBe("second.mp4")
  expect(el.getAttribute("poster")).toBe("next.jpg")
  const s = p.getState()
  expect(s.currentTime).toBe(0)
  expect(s.duration).toBe(0)
  expect(s.ended).toBe(false)
  expect(s.error).toBeNull()
  p.destroy()
})

test("destroy removes the video element from its host", () => {
  const p = createNativeProvider({ src: "clip.mp4" })
  const { host } = mount(p)
  p.destroy()
  expect(host.querySelector("video")).toBeNull()
})
