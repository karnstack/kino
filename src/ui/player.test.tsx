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

test("renders the placeholder behind the video host when given", () => {
  const provider = createFakeProvider()
  const { container } = render(
    <Player provider={provider} placeholder="data:image/png;base64,AAAA" />,
  )
  const img = container.querySelector(".kino-placeholder") as HTMLImageElement
  expect(img).toBeInTheDocument()
  expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA")
  // Must paint behind the video, so it precedes the host in the DOM.
  const host = container.querySelector(".kino-video-host")
  expect(
    img.compareDocumentPosition(host as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

test("omits the placeholder when not given", () => {
  const provider = createFakeProvider()
  const { container } = render(<Player provider={provider} />)
  expect(container.querySelector(".kino-placeholder")).toBeNull()
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
