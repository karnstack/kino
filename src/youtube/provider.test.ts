import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createYouTubeProvider, parseYouTubeId } from "./provider"

// YT.PlayerState numeric codes (mirrors the real IFrame API).
const PS = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
}

// A faithful stand-in for YT.Player: jsdom has no IFrame API, so we record the
// methods the provider calls and fire the events the real player would.
class FakePlayer {
  static instances: FakePlayer[] = []
  // When true, the player is constructed but onReady is withheld until
  // fireReady() — mirrors the real API, where methods only work post-ready.
  static deferReady = false
  opts: {
    videoId: string
    playerVars?: Record<string, unknown>
    events?: Record<string, (e: unknown) => void>
  }
  destroyed = false
  rate = 1
  vol = 100
  private _muted = false
  current = 0
  dur = 100
  loaded = 0.5
  state = PS.CUED
  polls = 0 // counts the polling getter, so a test can prove no early polling
  tracklist: Array<{ languageCode: string; displayName: string }> = [
    { languageCode: "en", displayName: "English" },
    { languageCode: "es", displayName: "Spanish" },
  ]
  modules: string[] = []
  lastOption: { module: string; option: string; value: unknown } | null = null
  loadVideoById = vi.fn((id: string) => {
    this.opts.videoId = id
    this.rate = 1 // a load resets the element's playback rate to 1x
    this.fire(PS.PLAYING)
  })

  constructor(
    el: HTMLElement,
    opts: FakePlayer["opts"] & {
      events?: Record<string, (e: unknown) => void>
    },
  ) {
    this.opts = opts
    FakePlayer.instances.push(this)
    // The real API replaces the passed element with an <iframe>.
    const iframe = document.createElement("iframe")
    el.replaceWith(iframe)
    // onReady fires once the player is constructed (deferred when asked).
    if (!FakePlayer.deferReady) this.fireReady()
  }
  fireReady() {
    this.opts.events?.onReady?.({ target: this })
  }
  private fire(state: number) {
    this.state = state
    this.opts.events?.onStateChange?.({ target: this, data: state })
  }
  playVideo() {
    this.fire(PS.PLAYING)
  }
  pauseVideo() {
    this.fire(PS.PAUSED)
  }
  buffer() {
    this.fire(PS.BUFFERING)
  }
  seekTo(t: number) {
    this.current = t
  }
  getCurrentTime() {
    this.polls++
    return this.current
  }
  getDuration() {
    return this.dur
  }
  getVideoLoadedFraction() {
    return this.loaded
  }
  setPlaybackRate(r: number) {
    this.rate = r
  }
  getPlaybackRate() {
    return this.rate
  }
  setVolume(v: number) {
    this.vol = v
  }
  getVolume() {
    return this.vol
  }
  mute() {
    this._muted = true
  }
  unMute() {
    this._muted = false
  }
  isMuted() {
    return this._muted
  }
  getPlayerState() {
    return this.state
  }
  loadModule(m: string) {
    this.modules.push(m)
  }
  unloadModule() {}
  getOption(_module: string, option: string) {
    return option === "tracklist" ? this.tracklist : undefined
  }
  setOption(module: string, option: string, value: unknown) {
    this.lastOption = { module, option, value }
  }
  destroy() {
    this.destroyed = true
  }
}

beforeEach(() => {
  FakePlayer.instances = []
  FakePlayer.deferReady = false
  ;(window as unknown as { YT: unknown }).YT = {
    Player: FakePlayer,
    PlayerState: PS,
  }
})

afterEach(() => {
  delete (window as unknown as { YT?: unknown }).YT
})

function mount(provider: ReturnType<typeof createYouTubeProvider>) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  provider.mount(host)
  const player = FakePlayer.instances.at(-1)!
  return { host, player }
}

test("parseYouTubeId extracts the id from every common URL form", () => {
  expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
    "dQw4w9WgXcQ",
  )
  expect(
    parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"),
  ).toBe("dQw4w9WgXcQ")
  expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(
    "dQw4w9WgXcQ",
  )
  expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
    "dQw4w9WgXcQ",
  )
  expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
    "dQw4w9WgXcQ",
  )
})

test("initial state defaults paused with auto quality and the given rate", () => {
  const p = createYouTubeProvider({ videoId: "abc", defaultRate: 1.5 })
  const s = p.getState()
  expect(s.paused).toBe(true)
  expect(s.activeQualityId).toBe("auto")
  expect(s.rate).toBe(1.5)
  p.destroy()
})

test("capabilities: rate + fullscreen only; no quality, pip, captions, storyboard", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const caps = p.getState().capabilities
  expect(caps.canSetRate).toBe(true)
  expect(caps.canFullscreen).toBe(true)
  expect(caps.canSetQuality).toBe(false)
  expect(caps.canPiP).toBe(false)
  expect(caps.hasTextTracks).toBe(false)
  expect(caps.hasStoryboard).toBe(false)
  p.destroy()
})

test("mount creates a YT.Player with the video id and custom-chrome player vars", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  expect(player.opts.videoId).toBe("abc")
  expect(player.opts.playerVars?.controls).toBe(0)
  expect(player.opts.playerVars?.playsinline).toBe(1)
  p.destroy()
})

test("mount accepts a full URL and resolves it to the id", () => {
  const p = createYouTubeProvider({
    videoId: "https://youtu.be/dQw4w9WgXcQ",
  })
  const { player } = mount(p)
  expect(player.opts.videoId).toBe("dQw4w9WgXcQ")
  p.destroy()
})

test("play and pause flip paused via the player's state-change events", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  mount(p)
  p.actions.play()
  expect(p.getState().paused).toBe(false)
  p.actions.pause()
  expect(p.getState().paused).toBe(true)
  p.destroy()
})

test("buffering mid-playback is not reported as paused", () => {
  // A stall would otherwise read as paused and flash the poster cover.
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.play()
  expect(p.getState().paused).toBe(false)
  player.buffer()
  expect(p.getState().paused).toBe(false)
  p.destroy()
})

test("seek forwards to the player's seekTo", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.seek(30)
  expect(player.getCurrentTime()).toBe(30)
  p.destroy()
})

test("setRate reflects immediately and calls the player", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.setRate(2)
  expect(p.getState().rate).toBe(2)
  expect(player.getPlaybackRate()).toBe(2)
  p.destroy()
})

test("setVolume maps 0..1 to the player's 0..100 scale", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.setVolume(0.5)
  expect(player.getVolume()).toBe(50)
  p.destroy()
})

test("setMuted toggles the player and reflects in state", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.setMuted(true)
  expect(player.isMuted()).toBe(true)
  p.actions.setMuted(false)
  expect(player.isMuted()).toBe(false)
  p.destroy()
})

test("setQuality is a no-op (stays auto)", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  mount(p)
  p.actions.setQuality("anything")
  expect(p.getState().activeQualityId).toBe("auto")
  p.destroy()
})

test("playback rate survives a source swap", () => {
  const p = createYouTubeProvider({ videoId: "first" })
  const { player } = mount(p)
  p.actions.setRate(2)
  // YouTube carries the next video id through SourceOptions.src.
  p.swapSource?.({ src: "second" })
  expect(player.getPlaybackRate()).toBe(2)
  expect(p.getState().rate).toBe(2)
  p.destroy()
})

test("swapSource loads the new video and resets progress", () => {
  const p = createYouTubeProvider({ videoId: "first" })
  const { player } = mount(p)
  player.current = 42
  p.swapSource?.({ src: "second" })
  expect(player.loadVideoById).toHaveBeenCalledWith("second")
  const s = p.getState()
  expect(s.currentTime).toBe(0)
  expect(s.duration).toBe(0)
  expect(s.ended).toBe(false)
  expect(s.error).toBeNull()
  p.destroy()
})

test("discovers caption tracks from the captions module", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  mount(p)
  const s = p.getState()
  expect(s.capabilities.hasTextTracks).toBe(true)
  expect(s.textTracks.map((t) => t.label)).toEqual(["English", "Spanish"])
  expect(s.textTracks.map((t) => t.id)).toEqual(["en", "es"])
  p.destroy()
})

test("loads the captions module once the player is ready", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  expect(player.modules).toContain("captions")
  p.destroy()
})

test("setTextTrack enables the chosen language via the captions module", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.setTextTrack("es")
  expect(p.getState().activeTextTrackId).toBe("es")
  expect(player.lastOption).toEqual({
    module: "captions",
    option: "track",
    value: { languageCode: "es" },
  })
  p.destroy()
})

test("setTextTrack(null) turns captions off", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.actions.setTextTrack("en")
  p.actions.setTextTrack(null)
  expect(p.getState().activeTextTrackId).toBeNull()
  expect(player.lastOption).toEqual({
    module: "captions",
    option: "track",
    value: {},
  })
  p.destroy()
})

test("does not poll the player until it is ready", () => {
  // The IFrame API attaches its methods only after onReady fires; a ticker that
  // polls before then throws "getPlaybackRate is not a function". The provider
  // must not touch the player until ready.
  vi.useFakeTimers()
  try {
    FakePlayer.deferReady = true
    const p = createYouTubeProvider({ videoId: "abc" })
    const host = document.createElement("div")
    document.body.appendChild(host)
    p.mount(host)
    const player = FakePlayer.instances.at(-1)!
    vi.advanceTimersByTime(1000)
    expect(player.polls).toBe(0) // no polling before ready
    player.fireReady()
    vi.advanceTimersByTime(1000)
    expect(player.polls).toBeGreaterThan(0) // polling once ready
    p.destroy()
  } finally {
    vi.useRealTimers()
  }
})

test("subscribe is notified on state change", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  mount(p)
  let calls = 0
  const off = p.subscribe(() => calls++)
  p.actions.setRate(0.5)
  expect(calls).toBeGreaterThan(0)
  off()
  p.destroy()
})

test("destroy tears down the player", () => {
  const p = createYouTubeProvider({ videoId: "abc" })
  const { player } = mount(p)
  p.destroy()
  expect(player.destroyed).toBe(true)
})

test("destroy before the player is ready tears it down once it loads", async () => {
  // No window.YT yet: the provider must wait for the API and then honor an
  // early destroy by tearing the player down as soon as it resolves.
  delete (window as unknown as { YT?: unknown }).YT
  vi.resetModules()
  const mod = await import("./provider")
  const host = document.createElement("div")
  document.body.appendChild(host)
  const p = mod.createYouTubeProvider({ videoId: "abc" })
  p.mount(host)
  // A script tag for the IFrame API should have been injected.
  const script = document.querySelector('script[src*="youtube.com/iframe_api"]')
  expect(script).toBeTruthy()
  p.destroy()
  // Now the API "arrives": the provider must not leave a live player behind.
  ;(window as unknown as { YT: unknown }).YT = {
    Player: FakePlayer,
    PlayerState: PS,
  }
  ;(
    window as unknown as { onYouTubeIframeAPIReady?: () => void }
  ).onYouTubeIframeAPIReady?.()
  await Promise.resolve()
  const created = FakePlayer.instances.at(-1)
  if (created) expect(created.destroyed).toBe(true)
})
