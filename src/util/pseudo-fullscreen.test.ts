import { enterPseudoFullscreen } from "./pseudo-fullscreen"

// jsdom's CSS parser drops values it cannot parse (100dvh, env()), so the
// assertions stick to properties jsdom round-trips: position, z-index,
// overflow. The save/restore behavior is what matters here.

test("applies fixed positioning and locks page scroll", () => {
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  const restore = enterPseudoFullscreen(wrapper)
  expect(wrapper.style.position).toBe("fixed")
  expect(wrapper.style.zIndex).toBe("2147483647")
  expect(document.documentElement.style.overflow).toBe("hidden")
  expect(document.body.style.overflow).toBe("hidden")
  restore()
  wrapper.remove()
})

test("restore reinstates prior inline values exactly", () => {
  const wrapper = document.createElement("div")
  wrapper.style.position = "relative"
  wrapper.style.background = "red"
  document.body.appendChild(wrapper)
  document.body.style.overflow = "scroll"
  const restore = enterPseudoFullscreen(wrapper)
  restore()
  expect(wrapper.style.position).toBe("relative")
  expect(wrapper.style.background).toBe("red")
  expect(wrapper.style.zIndex).toBe("")
  expect(document.body.style.overflow).toBe("scroll")
  expect(document.documentElement.style.overflow).toBe("")
  document.body.style.overflow = ""
  wrapper.remove()
})

test("restore is idempotent", () => {
  const wrapper = document.createElement("div")
  document.body.appendChild(wrapper)
  const restore = enterPseudoFullscreen(wrapper)
  restore()
  wrapper.style.position = "sticky"
  restore()
  expect(wrapper.style.position).toBe("sticky")
  wrapper.remove()
})
