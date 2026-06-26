import { render, screen, act } from "@testing-library/react"
import {
  PlayerContext,
  useMediaSelector,
  usePlayer,
  usePlayerActions,
} from "./store"
import { createFakeProvider } from "./fake-provider"

function Time() {
  const t = useMediaSelector((s) => s.currentTime)
  return <span data-testid="t">{t}</span>
}

test("useMediaSelector re-renders only when the selected slice changes", () => {
  const provider = createFakeProvider()
  let renders = 0
  function Counted() {
    renders++
    const paused = useMediaSelector((s) => s.paused)
    return <span data-testid="p">{String(paused)}</span>
  }
  render(
    <PlayerContext.Provider value={provider}>
      <Counted />
    </PlayerContext.Provider>,
  )
  const before = renders
  act(() => provider.set({ currentTime: 5 })) // unrelated slice
  expect(renders).toBe(before) // no re-render
  act(() => provider.set({ paused: false }))
  expect(screen.getByTestId("p").textContent).toBe("false")
})

test("usePlayerActions does not re-render on unrelated state changes but drives state", () => {
  const provider = createFakeProvider()
  let renders = 0
  function Btn() {
    renders++
    const actions = usePlayerActions()
    return <button onClick={() => actions.seek(7)}>seek</button>
  }
  render(
    <PlayerContext.Provider value={provider}>
      <Btn />
      <Time />
    </PlayerContext.Provider>,
  )
  const before = renders
  act(() => provider.set({ currentTime: 5 })) // unrelated slice
  expect(renders).toBe(before) // no re-render: actions is non-subscribing
  act(() => screen.getByText("seek").click())
  expect(screen.getByTestId("t").textContent).toBe("7") // action still drives state
})

test("usePlayer exposes actions that drive state", () => {
  const provider = createFakeProvider()
  function Btn() {
    const { actions } = usePlayer()
    return <button onClick={() => actions.seek(9)}>seek</button>
  }
  render(
    <PlayerContext.Provider value={provider}>
      <Btn />
      <Time />
    </PlayerContext.Provider>,
  )
  act(() => screen.getByText("seek").click())
  expect(screen.getByTestId("t").textContent).toBe("9")
})
