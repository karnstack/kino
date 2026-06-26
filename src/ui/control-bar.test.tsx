import { render, screen, act } from "@testing-library/react"
import { Player } from "./player"
import { ControlBar } from "./control-bar"
import { createFakeProvider } from "../core/fake-provider"

test("play/pause button toggles and shows time", () => {
  const provider = createFakeProvider({
    paused: true,
    duration: 68,
    currentTime: 3,
  })
  render(
    <Player provider={provider}>
      <ControlBar />
    </Player>,
  )
  expect(screen.getByText("0:03")).toBeInTheDocument()
  expect(screen.getByText(/1:08/)).toBeInTheDocument()
  act(() => screen.getByRole("button", { name: "Play" }).click())
  expect(provider.getState().paused).toBe(false)
})
