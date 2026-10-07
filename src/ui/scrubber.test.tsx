import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { Scrubber } from "./scrubber"

test("renders progress fill proportional to currentTime/duration", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 25 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
  )
  const fill = screen.getByTestId("kino-progress")
  expect(fill.style.width).toBe("25%")
})

test("clicking the track seeks", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
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
      new MouseEvent("pointerdown", { clientX: 100, bubbles: true }),
    )
  })
  expect(provider.getState().currentTime).toBe(50)
})

test("clicking the scrubber padding (off the thin track) also seeks", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
  )
  const track = screen.getByTestId("kino-track")
  const scrubber = track.parentElement as HTMLElement
  // time mapping is derived from the track rect; stub it
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
  // pointer lands on the scrubber's vertical padding, not the thin track line
  act(() => {
    scrubber.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, bubbles: true }),
    )
  })
  expect(provider.getState().currentTime).toBe(50)
})

import { fireEvent } from "@testing-library/react"
import { MarkersContext } from "./markers"
import type { Marker } from "../core/types"

function withMarkers(markers: Marker[], onMarkerClick?: (id: string) => void) {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  const utils = render(
    <PlayerContext.Provider value={provider}>
      <MarkersContext.Provider value={{ markers, onMarkerClick }}>
        <Scrubber />
      </MarkersContext.Provider>
    </PlayerContext.Provider>,
  )
  return { provider, ...utils }
}

test("without markers there is no marker layer", () => {
  const provider = createFakeProvider({ duration: 100, currentTime: 0 })
  const { container } = render(
    <PlayerContext.Provider value={provider}>
      <Scrubber />
    </PlayerContext.Provider>,
  )
  expect(container.querySelector(".kino-markers")).toBeNull()
})

test("places markers by time over duration", () => {
  withMarkers([
    { id: "a", time: 25 },
    { id: "b", time: 80, color: "red" },
  ])
  const [a, b] = screen.getAllByTestId("kino-marker")
  expect(a!.style.left).toBe("25%")
  expect(b!.style.left).toBe("80%")
  expect(b!.style.getPropertyValue("--kino-marker-color")).toBe("red")
})

test("skips markers outside the duration", () => {
  const { container } = withMarkers([
    { id: "neg", time: -1 },
    { id: "late", time: 101 },
    { id: "nan", time: Number.NaN },
  ])
  expect(screen.queryAllByTestId("kino-marker")).toHaveLength(0)
  expect(container.querySelector(".kino-markers")).toBeNull()
})

test("clicking a marker calls onMarkerClick and does not seek", () => {
  const onMarkerClick = vi.fn()
  const { provider } = withMarkers(
    [{ id: "a", time: 50, label: "Lee: gzip" }],
    onMarkerClick,
  )
  const marker = screen.getByTestId("kino-marker")
  fireEvent.pointerDown(marker, { clientX: 100 })
  fireEvent.click(marker)
  expect(onMarkerClick).toHaveBeenCalledWith("a")
  expect(provider.getState().currentTime).toBe(0)
})

test("a marker has an accessible name: its label, else its time", () => {
  withMarkers([
    { id: "a", time: 50, label: "Lee: gzip" },
    { id: "b", time: 61 },
  ])
  expect(screen.getByRole("button", { name: "Lee: gzip" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Marker at 1:01" })).toBeTruthy()
})

test("hovering a marker shows its label in the preview", () => {
  withMarkers([{ id: "a", time: 50, label: "Lee: gzip" }])
  const track = screen.getByTestId("kino-track")
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
  const marker = screen.getByTestId("kino-marker")
  fireEvent.pointerMove(marker, { clientX: 100 })
  fireEvent.pointerOver(marker)
  expect(
    screen.getByText("Lee: gzip", { selector: ".kino-preview-label" }),
  ).toBeTruthy()
})
