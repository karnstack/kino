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

  it("excludes Vimeo's auto pseudo-quality so no 0p row appears", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player._qualities = [
      { id: "auto", label: "Auto", active: true },
      { id: "1080p", label: "1080p", active: false },
    ]
    player.emit("loaded")
    await flush()
    const s = provider.getState()
    expect(s.qualities.map((q) => q.id)).toEqual(["1080p"]) // no "auto"/0p row
    expect(s.qualities.every((q) => q.height > 0)).toBe(true)
    expect(s.activeQualityId).toBe("auto") // still tracks auto as the active id
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

  // Regression: seeking event from SDK must update currentTime to the target
  // position immediately. Without this, the scrubber stays at the pre-seek
  // position for the entire buffering window (several seconds on an unbuffered
  // seek), which the user sees as a "seek that didn't take / laggy seek".
  it("SDK seeking event immediately advances currentTime to the target", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("timeupdate", { seconds: 30, duration: 120 })
    expect(provider.getState().currentTime).toBe(30)

    provider.actions.seek(90)
    player.emit("seeking", { seconds: 90, duration: 120 })

    expect(provider.getState().seeking).toBe(true)
    expect(provider.getState().currentTime).toBe(90) // scrubber must show target
    provider.destroy()
  })

  // Regression: currentTime stays at the target during the buffering window
  // (no timeupdate/seeked yet) so the scrubber does not snap back.
  it("currentTime holds at seek target during the buffering window", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("timeupdate", { seconds: 30, duration: 120 })
    provider.actions.seek(90)
    player.emit("seeking", { seconds: 90, duration: 120 })
    player.emit("bufferstart") // buffering starts for the unbuffered region

    // During buffering: scrubber must remain at 90, not snap back to 30
    expect(provider.getState().currentTime).toBe(90)
    expect(provider.getState().seeking).toBe(true)

    // Once buffering finishes and seeked fires, seeking clears
    player.emit("bufferend")
    player.emit("seeked", { seconds: 90 })
    expect(provider.getState().currentTime).toBe(90)
    expect(provider.getState().seeking).toBe(false)
    provider.destroy()
  })

  // Regression: bufferstart during a paused seek must not corrupt paused flag.
  // Previously bufferstart unconditionally patched paused:false. If the user
  // was paused and sought into an unbuffered region, bufferstart would flip
  // paused to false; after seeked cleared seeking, the player was physically
  // paused but kino state said paused:false (no further events to correct it).
  it("bufferstart during a paused seek does not flip paused to false", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    expect(provider.getState().paused).toBe(true) // default: paused

    provider.actions.seek(90)
    player.emit("seeking", { seconds: 90, duration: 120 })
    player.emit("bufferstart") // fires because target is unbuffered

    expect(provider.getState().paused).toBe(true) // must stay paused
    expect(provider.getState().seeking).toBe(true)

    player.emit("bufferend")
    player.emit("seeked", { seconds: 90 })
    expect(provider.getState().paused).toBe(true) // still paused after seek
    expect(provider.getState().seeking).toBe(false)
    provider.destroy()
  })

  // Ensure the original intent of bufferstart is preserved: during active
  // playback a buffer stall must keep paused:false (no poster-image flash).
  it("bufferstart during active playback keeps paused false", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    player.emit("play")
    expect(provider.getState().paused).toBe(false)

    player.emit("bufferstart") // buffer stall mid-playback (not a seek)
    expect(provider.getState().paused).toBe(false)
    provider.destroy()
  })

  it("setVolume passes 0..1 unscaled", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.setVolume(0.4)
    expect(player.calls).toContainEqual(["setVolume", 0.4])
    provider.destroy()
  })

  it("setRate calls the SDK and does not patch rate synchronously", async () => {
    const { provider, player } = await ready({ videoId: "1" })
    provider.actions.setRate(2)
    expect(player.calls).toContainEqual(["setPlaybackRate", 2])
    expect(provider.getState().rate).toBe(1) // no optimistic patch
    provider.destroy()
  })

  it("patches rate when setPlaybackRate resolves, even without a playbackratechange echo", async () => {
    const { provider } = await ready({ videoId: "1" })
    provider.actions.setRate(1.5)
    expect(provider.getState().rate).toBe(1) // not synchronous
    await flush() // setPlaybackRate promise resolves; Vimeo emits no echo
    expect(provider.getState().rate).toBe(1.5)
    provider.destroy()
  })

  it("also reflects a native-control playbackratechange echo", async () => {
    const { provider, player } = await ready({ videoId: "1" })
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

describe("captions", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  const withTracks = async () => {
    const r = await ready({ videoId: "1" })
    r.player._textTracks = [
      { label: "English", language: "en", kind: "captions", mode: "disabled" },
      { label: "Français", language: "fr", kind: "subtitles", mode: "disabled" },
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

describe("picture-in-picture allow attribute", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  // Regression: the Vimeo SDK creates the iframe with only
  // allow="autoplay; encrypted-media". Without "picture-in-picture" the browser
  // silently rejects requestPictureInPicture() inside the cross-origin frame
  // (Permissions Policy enforcement at the iframe boundary). kino must patch
  // the attribute via MutationObserver before the frame navigation completes.
  it("patches allow=picture-in-picture on the SDK-injected iframe", async () => {
    const provider = createVimeoProvider({ videoId: "1" })
    const container = mount(provider)
    await flush()
    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("allow")).toContain("picture-in-picture")
    provider.destroy()
  })

  it("appends to the SDK's existing allow tokens without dropping them", async () => {
    // The fake injects allow="autoplay; encrypted-media" like the real SDK.
    const provider = createVimeoProvider({ videoId: "1" })
    const container = mount(provider)
    await flush()
    const allow = container.querySelector("iframe")!.getAttribute("allow") ?? ""
    expect(allow).toContain("autoplay")
    expect(allow).toContain("encrypted-media")
    expect(allow).toContain("picture-in-picture")
    // Appended once, not duplicated.
    expect(allow.split("picture-in-picture").length - 1).toBe(1)
    provider.destroy()
  })
})

describe("swapSource", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => uninstallFakeVimeo())

  it("loads a public id and resets progress + rate", async () => {
    const { provider, player } = await ready({ videoId: "1", defaultRate: 1.5 })
    player.emit("timeupdate", { seconds: 30, duration: 60, percent: 0.5 })
    provider.swapSource!({ src: "987654321" })
    await flush()
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
    await flush()
    expect(player.calls).toContainEqual([
      "loadVideo",
      { url: "https://player.vimeo.com/video/987654321?h=newhash" },
    ])
    provider.destroy()
  })
})
