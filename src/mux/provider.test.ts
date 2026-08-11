import { expect, test, vi } from "vitest"
import { createMuxProvider } from "./provider"

// jsdom hands back a plain array for HTMLMediaElement.textTracks rather than a
// TextTrackList, and mount() registers track listeners on it. Give the list the
// two methods it needs so the provider can mount here at all.
const mediaProto = HTMLMediaElement.prototype
const textTracks = Object.getOwnPropertyDescriptor(mediaProto, "textTracks")!
Object.defineProperty(mediaProto, "textTracks", {
  configurable: true,
  get(this: HTMLMediaElement) {
    const list = textTracks.get!.call(this) as TextTrackList
    const target = list as unknown as Record<string, unknown>
    if (list && typeof target.addEventListener !== "function") {
      target.addEventListener = () => {}
      target.removeEventListener = () => {}
    }
    return list
  },
})

// jsdom decodes no media, so playback here is a stand-in for it: the element
// reports itself playing until something calls pause() on it, which is the
// contract destroy() has to meet.
function mountPlaying() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const provider = createMuxProvider({ playbackId: "abc123", autoPlay: true })
  provider.mount(host)
  const el = host.querySelector("mux-video") as HTMLVideoElement
  let paused = false
  const pause = vi.fn(() => {
    paused = true
  })
  Object.defineProperty(el, "paused", { configurable: true, get: () => paused })
  Object.defineProperty(el, "pause", { configurable: true, value: pause })
  return { host, provider, el, pause }
}

test("destroy pauses the element it created", () => {
  const { provider, el, pause } = mountPlaying()
  expect(el.paused).toBe(false)
  provider.destroy()
  expect(pause).toHaveBeenCalled()
  expect(el.paused).toBe(true)
})

test("destroy detaches the element", () => {
  const { host, provider, el } = mountPlaying()
  provider.destroy()
  expect(host.querySelector("mux-video")).toBeNull()
  expect(el.isConnected).toBe(false)
})

test("destroy releases the source so the engine stops fetching", () => {
  const { provider, el } = mountPlaying()
  expect(el.getAttribute("src")).toContain("abc123")
  provider.destroy()
  expect(el.hasAttribute("src")).toBe(false)
})

test("the released source stays released once mux-video finishes its setup", async () => {
  // mux-video loads its source a microtask after the attribute lands, so an
  // element destroyed in the same tick it was mounted would otherwise come up
  // playing after it was already thrown away.
  const { provider, el } = mountPlaying()
  provider.destroy()
  await new Promise((r) => setTimeout(r, 0))
  expect(el.hasAttribute("src")).toBe(false)
})

test("mount, destroy, mount leaves the first element stopped", () => {
  // React invokes a mount effect twice in development: mount, destroy, mount.
  // The first element is unreachable afterwards, because every control on the
  // page talks to the provider that owned it, so anything it is still doing
  // plays over the second one until the tab closes.
  const first = mountPlaying()
  first.provider.destroy()
  const second = mountPlaying()
  expect(second.el).not.toBe(first.el)
  expect(first.pause).toHaveBeenCalled()
  expect(first.el.paused).toBe(true)
  expect(first.el.isConnected).toBe(false)
  expect(first.el.hasAttribute("src")).toBe(false)
  expect(second.el.isConnected).toBe(true)
  second.provider.destroy()
})
