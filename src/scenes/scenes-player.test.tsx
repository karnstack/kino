import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup, act } from "@testing-library/react"
import { ScenesPlayer } from "./scenes-player"

const SRC = "https://scenes.example.com/l/demo?token=abc"

// Grab the provider's iframe and capture everything posted into it.
function captureHostPosts() {
  const iframe = document.querySelector("iframe") as HTMLIFrameElement
  const posted: unknown[] = []
  iframe.contentWindow!.postMessage = (msg: unknown) => posted.push(msg)
  return { iframe, posted }
}

// Simulate the host announcing ready, which makes the provider reply with
// kino:init. Same origin/source construction as the provider suite.
function ready(iframe: HTMLIFrameElement) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "kino:ready", duration: 40.5 },
        origin: "https://scenes.example.com",
        source: iframe.contentWindow,
      }),
    )
  })
}

describe("<ScenesPlayer>", () => {
  afterEach(cleanup)

  it("seeds the host with sceneTheme and flips it live without remount", () => {
    const view = render(
      <ScenesPlayer
        src={SRC}
        // Chrome theme and stage theme are independent props.
        theme={{ "--kino-radius": "4px" }}
        sceneTheme="light"
      />,
    )
    const { iframe, posted } = captureHostPosts()
    ready(iframe)
    expect(posted).toContainEqual(
      expect.objectContaining({ type: "kino:init", theme: "light" }),
    )
    view.rerender(<ScenesPlayer src={SRC} sceneTheme="dark" />)
    expect(posted).toContainEqual({ type: "kino:setTheme", theme: "dark" })
    // Same iframe: the flip rode the wire, no rebuild.
    expect(document.querySelector("iframe")).toBe(iframe)
  })

  it("omitting sceneTheme inits the host dark", () => {
    render(<ScenesPlayer src={SRC} />)
    const { iframe, posted } = captureHostPosts()
    ready(iframe)
    expect(posted).toContainEqual(
      expect.objectContaining({ type: "kino:init", theme: "dark" }),
    )
  })
})
