import { mountPipPlaceholder, mountPipOverlay } from "./pip-surfaces"

test("placeholder mounts, forwards clicks, and cleans up", () => {
  const container = document.createElement("div")
  const onReturn = vi.fn()
  const cleanup = mountPipPlaceholder(container, onReturn)
  const el = container.querySelector(".kino-pip-placeholder") as HTMLElement
  expect(el.textContent).toBe("Playing in picture in picture")
  el.click()
  expect(onReturn).toHaveBeenCalledOnce()
  cleanup()
  expect(container.querySelector(".kino-pip-placeholder")).toBeNull()
})

function overlayHarness(state: { paused: boolean; activeCueText: string }) {
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
  const state = { paused: true, activeCueText: "" }
  const { deps, emit } = overlayHarness(state)
  const cleanup = mountPipOverlay(window, deps)
  const btn = document.body.querySelector(
    "[data-kino-pip-overlay] button",
  ) as HTMLButtonElement
  expect(btn.getAttribute("aria-label")).toBe("Play")
  btn.click()
  expect(deps.play).toHaveBeenCalledOnce()
  state.paused = false
  state.activeCueText = "hello from the sequence"
  emit()
  expect(btn.getAttribute("aria-label")).toBe("Pause")
  expect(
    document.body.querySelector("[data-kino-pip-overlay]")!.textContent,
  ).toContain("hello from the sequence")
  btn.click()
  expect(deps.pause).toHaveBeenCalledOnce()
  cleanup()
  expect(document.body.querySelector("[data-kino-pip-overlay]")).toBeNull()
})

test("overlay cleanup unsubscribes", () => {
  const { deps, listeners } = overlayHarness({
    paused: true,
    activeCueText: "",
  })
  const cleanup = mountPipOverlay(window, deps)
  expect(listeners.size).toBe(1)
  cleanup()
  expect(listeners.size).toBe(0)
})
