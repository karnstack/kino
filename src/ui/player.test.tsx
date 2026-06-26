import { render, screen, act, fireEvent } from "@testing-library/react"
import { Player } from "./player"
import { createFakeProvider } from "../core/fake-provider"

test("renders children overlay and applies accent var", () => {
  const provider = createFakeProvider()
  const { container } = render(
    <Player provider={provider} accentColor="rgb(1,2,3)">
      <Player.Overlay>
        <span>hi</span>
      </Player.Overlay>
    </Player>,
  )
  expect(screen.getByText("hi")).toBeInTheDocument()
  const root = container.querySelector(".kino") as HTMLElement
  expect(root.style.getPropertyValue("--kino-accent")).toBe("rgb(1,2,3)")
})

test("space toggles playback via keyboard", () => {
  const provider = createFakeProvider({ paused: true })
  const { container } = render(<Player provider={provider} />)
  const root = container.querySelector(".kino") as HTMLElement
  act(() => {
    fireEvent.keyDown(root, { key: " " })
  })
  expect(provider.getState().paused).toBe(false)
})
