import { render, screen, act, fireEvent } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { Scrubber } from "./scrubber"
import { MarkersContext } from "./markers"
import type { Marker } from "../core/types"

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

function stubRect(el: HTMLElement) {
  el.getBoundingClientRect = () => ({
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
}

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

test("a marker with an icon draws the icon instead of a dot", () => {
  withMarkers([{ id: "r", time: 50, icon: "🔥", label: "🔥 3 at 0:50" }])
  const m = screen.getByTestId("kino-marker")
  expect(m.textContent).toBe("🔥")
  expect(m.classList.contains("kino-marker-icon")).toBe(true)
})

test("a marker without an icon stays a dot", () => {
  withMarkers([{ id: "a", time: 50 }])
  const m = screen.getByTestId("kino-marker")
  expect(m.textContent).toBe("")
  expect(m.classList.contains("kino-marker-icon")).toBe(false)
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
  stubRect(screen.getByTestId("kino-track"))
  const marker = screen.getByTestId("kino-marker")
  act(() => {
    marker.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, bubbles: true }),
    )
  })
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
  stubRect(screen.getByTestId("kino-track"))
  const marker = screen.getByTestId("kino-marker")
  act(() => {
    marker.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 100, bubbles: true }),
    )
  })
  fireEvent.pointerOver(marker)
  expect(
    screen.getByText("Lee: gzip", { selector: ".kino-preview-label" }),
  ).toBeTruthy()
})

function hoverMarker(marker: HTMLElement) {
  act(() => {
    marker.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 100, bubbles: true }),
    )
  })
  fireEvent.pointerOver(marker)
}

test("the preview rises above an icon marker but not a dot marker", () => {
  const { unmount } = withMarkers([{ id: "r", time: 50, icon: "🔥" }])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  expect(
    document
      .querySelector(".kino-preview")!
      .classList.contains("kino-preview-above-icon"),
  ).toBe(true)
  unmount()

  withMarkers([{ id: "a", time: 50 }])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  expect(
    document
      .querySelector(".kino-preview")!
      .classList.contains("kino-preview-above-icon"),
  ).toBe(false)
})

test("with any icon marker on the track, a dot marker's preview also rises", () => {
  withMarkers([
    { id: "r", time: 20, icon: "🔥" },
    { id: "a", time: 50 },
  ])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getAllByTestId("kino-marker")[1]!)
  expect(
    document
      .querySelector(".kino-preview")!
      .classList.contains("kino-preview-above-icon"),
  ).toBe(true)
})

test("hovering a marker shows the marker's own time", () => {
  withMarkers([{ id: "a", time: 50, label: "x" }])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  expect(
    document
      .querySelector(".kino-preview-time .kino-roll")!
      .getAttribute("aria-label"),
  ).toBe("0:50")
})

test("hovering a marker with a preview shows the preview instead of time and label", () => {
  withMarkers([
    {
      id: "a",
      time: 50,
      label: "Lee: gzip",
      preview: <p data-testid="rich">Lee says gzip</p>,
    },
  ])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  const preview = document.querySelector(".kino-preview")!
  expect(preview.classList.contains("kino-preview-rich")).toBe(true)
  expect(screen.getByTestId("rich").textContent).toBe("Lee says gzip")
  expect(preview.querySelector(".kino-preview-time")).toBeNull()
  expect(preview.querySelector(".kino-preview-label")).toBeNull()
})

test("a marker without a preview keeps the time and label preview", () => {
  withMarkers([{ id: "a", time: 50, label: "Lee: gzip" }])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  const preview = document.querySelector(".kino-preview")!
  expect(preview.classList.contains("kino-preview-rich")).toBe(false)
  expect(preview.querySelector(".kino-preview-time")).toBeTruthy()
  expect(preview.querySelector(".kino-preview-label")!.textContent).toBe(
    "Lee: gzip",
  )
})

test("a marker with a preview still takes its accessible name from label", () => {
  withMarkers([{ id: "a", time: 50, label: "Lee: gzip", preview: <b>rich</b> }])
  expect(screen.getByRole("button", { name: "Lee: gzip" })).toBeTruthy()
})

test("a rich preview above an icon marker still rises above the icon", () => {
  withMarkers([{ id: "r", time: 50, icon: "🔥", preview: <b>rich</b> }])
  stubRect(screen.getByTestId("kino-track"))
  hoverMarker(screen.getByTestId("kino-marker"))
  const cls = document.querySelector(".kino-preview")!.classList
  expect(cls.contains("kino-preview-rich")).toBe(true)
  expect(cls.contains("kino-preview-above-icon")).toBe(true)
})
