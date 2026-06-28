import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { VimeoPlayer } from "./vimeo-player"
import {
  FakeVimeoPlayer,
  installFakeVimeo,
  uninstallFakeVimeo,
  flush,
} from "./fake-vimeo"

describe("<VimeoPlayer>", () => {
  beforeEach(() => installFakeVimeo())
  afterEach(() => {
    cleanup()
    uninstallFakeVimeo()
  })

  it("creates exactly one player and swaps on videoId change", async () => {
    const view = render(<VimeoPlayer videoId="111" />)
    await flush()
    expect(FakeVimeoPlayer.instances).toHaveLength(1)
    view.rerender(<VimeoPlayer videoId="222" />)
    await flush()
    // Still one player; the new source flows through loadVideo, not a remount.
    expect(FakeVimeoPlayer.instances).toHaveLength(1)
    expect(
      FakeVimeoPlayer.instances[0]!.calls.find((c) => c[0] === "loadVideo")![1],
    ).toBe(222)
  })

  it("swaps to a ?h= url when hash changes", async () => {
    const view = render(<VimeoPlayer videoId="111" />)
    await flush()
    view.rerender(<VimeoPlayer videoId="111" hash="secret" />)
    await flush()
    expect(
      FakeVimeoPlayer.instances[0]!.calls.find((c) => c[0] === "loadVideo")![1],
    ).toEqual({ url: "https://player.vimeo.com/video/111?h=secret" })
  })
})
