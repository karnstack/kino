import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { SettingsSheet } from "./settings-sheet"

test("speed chips set the playback rate", () => {
  const provider = createFakeProvider({ paused: false, currentTime: 5 })
  render(
    <PlayerContext.Provider value={provider}>
      <SettingsSheet open onClose={() => {}} />
    </PlayerContext.Provider>,
  )
  act(() => screen.getByRole("button", { name: "1.5×" }).click())
  expect(provider.getState().rate).toBe(1.5)
})

test("captions section only appears when tracks exist", () => {
  const provider = createFakeProvider({
    capabilities: {
      canSetQuality: true,
      hasStoryboard: false,
      canPiP: true,
      canFullscreen: true,
      canSetRate: true,
      hasTextTracks: true,
    },
    textTracks: [
      { id: "en", kind: "captions", label: "English", lang: "en", mode: "hidden" },
    ],
  })
  render(
    <PlayerContext.Provider value={provider}>
      <SettingsSheet open onClose={() => {}} />
    </PlayerContext.Provider>,
  )
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument()
  act(() => screen.getByRole("button", { name: "English" }).click())
  expect(provider.getState().activeTextTrackId).toBe("en")
})
