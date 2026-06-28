import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { parseVimeoSource, playerUrl, createVimeoProvider } from "./provider"
import {
  FakeVimeoPlayer,
  installFakeVimeo,
  uninstallFakeVimeo,
  flush,
} from "./fake-vimeo"

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
    expect(s.textTracks.map((t) => t.id)).toEqual(["en.captions", "en.subtitles"])
    provider.destroy()
  })
})

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
