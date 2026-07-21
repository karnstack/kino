import { mountPipPlaceholder, mountPipOverlay } from "./pip-surfaces"

afterEach(() => {
  vi.useRealTimers()
})

test("placeholder mounts icon and copy, forwards clicks, and cleans up", () => {
  const container = document.createElement("div")
  const onReturn = vi.fn()
  const cleanup = mountPipPlaceholder(container, onReturn)
  const el = container.querySelector(".kino-pip-placeholder") as HTMLElement
  expect(el.querySelector("svg")).not.toBeNull()
  expect(el.textContent).toContain("Playing in picture in picture")
  expect(el.textContent).toContain("Click to return")
  el.click()
  expect(onReturn).toHaveBeenCalledOnce()
  cleanup()
  expect(container.querySelector(".kino-pip-placeholder")).toBeNull()
})

type OverlayState = {
  paused: boolean
  activeCueText: string
  currentTime: number
  duration: number
}

function overlayHarness(state: OverlayState) {
  const listeners = new Set<() => void>()
  const deps = {
    play: vi.fn(),
    pause: vi.fn(),
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  return { deps, emit: () => listeners.forEach((l) => l()), listeners }
}

test("overlay toggles play/pause off provider state and mirrors cue text", () => {
  const state = { paused: true, activeCueText: "", currentTime: 0, duration: 0 }
  const { deps, emit } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const root = document.body.querySelector(
    "[data-kino-pip-overlay]",
  ) as HTMLElement
  const btn = root.querySelector("button") as HTMLButtonElement
  expect(btn.getAttribute("aria-label")).toBe("Play")
  // play icon is a single filled path, pause is two rects (src/ui/icons.tsx)
  expect(btn.querySelector("svg path")).not.toBeNull()
  btn.click()
  expect(deps.play).toHaveBeenCalledOnce()
  state.paused = false
  state.activeCueText = "hello from the sequence"
  emit()
  expect(btn.getAttribute("aria-label")).toBe("Pause")
  expect(btn.querySelectorAll("svg rect").length).toBe(2)
  expect(root.textContent).toContain("hello from the sequence")
  btn.click()
  expect(deps.pause).toHaveBeenCalledOnce()
  cleanup()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
})

test("time readout pads seconds and progress line tracks position", () => {
  const state = {
    paused: true,
    activeCueText: "",
    currentTime: 65,
    duration: 130,
  }
  const { deps } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const root = document.body.querySelector(
    "[data-kino-pip-overlay]",
  ) as HTMLElement
  expect(root.textContent).toContain("1:05 / 2:10")
  const progress = root.querySelector("[data-kino-pip-progress]") as HTMLElement
  expect(progress.style.width).toBe("50%")
  cleanup()
})

test("cue pill hides entirely when empty and shows with text", () => {
  const state = { paused: true, activeCueText: "", currentTime: 0, duration: 0 }
  const { deps, emit } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const cue = document.body.querySelector("[data-kino-pip-cue]") as HTMLElement
  expect(cue.getAttribute("aria-live")).toBe("polite")
  expect(cue.style.display).toBe("none")
  state.activeCueText = "one server"
  emit()
  expect(cue.style.display).not.toBe("none")
  expect(cue.textContent).toBe("one server")
  state.activeCueText = ""
  emit()
  expect(cue.style.display).toBe("none")
  cleanup()
})

test("controls auto-hide while playing and reappear on pointer movement", () => {
  vi.useFakeTimers()
  const state = {
    paused: false,
    activeCueText: "cue",
    currentTime: 1,
    duration: 10,
  }
  const { deps, emit } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const bar = document.body.querySelector("[data-kino-pip-bar]") as HTMLElement
  const cue = document.body.querySelector("[data-kino-pip-cue]") as HTMLElement
  expect(bar.style.opacity).not.toBe("0")
  vi.advanceTimersByTime(2000)
  expect(bar.style.opacity).toBe("0")
  expect(cue.style.opacity).toBe("0")
  document.dispatchEvent(new Event("pointermove"))
  expect(bar.style.opacity).toBe("1")
  // pausing always shows the controls and stops the hide timer
  vi.advanceTimersByTime(2000)
  expect(bar.style.opacity).toBe("0")
  state.paused = true
  emit()
  expect(bar.style.opacity).toBe("1")
  vi.advanceTimersByTime(5000)
  expect(bar.style.opacity).toBe("1")
  cleanup()
})

test("overlay cleanup unsubscribes and removes the pointermove listener", () => {
  const addSpy = vi.spyOn(document, "addEventListener")
  const removeSpy = vi.spyOn(document, "removeEventListener")
  const { deps, listeners } = overlayHarness({
    paused: true,
    activeCueText: "",
    currentTime: 0,
    duration: 0,
  })
  const cleanup = mountPipOverlay(window, deps)
  expect(listeners.size).toBe(1)
  cleanup()
  expect(listeners.size).toBe(0)
  const added = addSpy.mock.calls.filter(([type]) => type === "pointermove")
  const removed = removeSpy.mock.calls.filter(
    ([type]) => type === "pointermove",
  )
  expect(added.length).toBe(1)
  expect(removed.length).toBe(1)
  expect(removed[0]![1]).toBe(added[0]![1])
  addSpy.mockRestore()
  removeSpy.mockRestore()
})
