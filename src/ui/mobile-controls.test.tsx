import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { MobileControls } from "./mobile-controls"

test("shows the centered cluster once playback has begun and play toggles", () => {
  const provider = createFakeProvider({
    paused: true,
    currentTime: 5,
    duration: 60,
  })
  render(
    <PlayerContext.Provider value={provider}>
      <MobileControls />
    </PlayerContext.Provider>,
  )
  expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "Back 5 seconds" }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "Forward 5 seconds" }),
  ).toBeInTheDocument()
  act(() => screen.getByRole("button", { name: "Play" }).click())
  expect(provider.getState().paused).toBe(false)
})

test("hidden at the very start so the idle overlay owns the screen", () => {
  const provider = createFakeProvider({ paused: true, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <MobileControls />
    </PlayerContext.Provider>,
  )
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull()
})
