// Fullscreen fallback for browsers without Element.requestFullscreen
// (iPhone-class WebKit, where the API does not exist at all). Pins the
// wrapper over the page and locks scroll. No fullscreenchange event fires
// in this mode, so the caller owns the fullscreen state transition.

type SavedStyle = { el: HTMLElement; prop: string; value: string }

export function enterPseudoFullscreen(wrapper: HTMLElement): () => void {
  const saved: SavedStyle[] = []
  const set = (el: HTMLElement, prop: string, value: string) => {
    saved.push({ el, prop, value: el.style.getPropertyValue(prop) })
    el.style.setProperty(prop, value)
  }
  set(wrapper, "position", "fixed")
  set(wrapper, "inset", "0")
  set(wrapper, "width", "100vw")
  // dvh tracks the iOS toolbar collapse; vh would leave a dead strip.
  set(wrapper, "height", "100dvh")
  set(wrapper, "z-index", "2147483647")
  set(wrapper, "background", "#000")
  set(
    wrapper,
    "padding",
    "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
  )
  set(document.documentElement, "overflow", "hidden")
  set(document.body, "overflow", "hidden")
  let restored = false
  return () => {
    if (restored) return
    restored = true
    for (const { el, prop, value } of saved) {
      if (value) el.style.setProperty(prop, value)
      else el.style.removeProperty(prop)
    }
  }
}
