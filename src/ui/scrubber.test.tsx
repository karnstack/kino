import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { Scrubber } from "./scrubber"

test("renders progress fill proportional to currentTime/duration", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 25 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>
  )
  const fill = screen.getByTestId("kino-progress")
  expect(fill.style.width).toBe("25%")
})

test("clicking the track seeks", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>
  )
  const track = screen.getByTestId("kino-track")
  // jsdom has no layout; stub getBoundingClientRect
  track.getBoundingClientRect = () => ({
    left: 0,
    width: 200,
    top: 0,
    height: 4,
    right: 200,
    bottom: 4,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  act(() => {
    track.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, bubbles: true })
    )
  })
  expect(provider.getState().currentTime).toBe(50)
})
