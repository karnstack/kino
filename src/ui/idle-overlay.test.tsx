import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { IdleOverlay } from "./idle-overlay"

test("shows speed options and starts playback at chosen rate", () => {
  const provider = createFakeProvider({ paused: true, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <IdleOverlay />
    </PlayerContext.Provider>
  )
  act(() => screen.getByRole("button", { name: "1.5x" }).click())
  expect(provider.getState().rate).toBe(1.5)
  expect(provider.getState().paused).toBe(false)
})

test("hidden once playback has progressed", () => {
  const provider = createFakeProvider({ paused: false, currentTime: 12 })
  render(
    <PlayerContext.Provider value={provider}>
      <IdleOverlay />
    </PlayerContext.Provider>
  )
  expect(screen.queryByLabelText("Play")).toBeNull()
})
