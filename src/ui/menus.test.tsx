import { render, screen, act } from "@testing-library/react"
import { PlayerContext } from "../core/store"
import { createFakeProvider } from "../core/fake-provider"
import { Player } from "./player"
import { SpeedMenu, QualityMenu } from "./menus"

test("speed menu sets rate", () => {
  const provider = createFakeProvider({ rate: 1 })
  render(
    <PlayerContext.Provider value={provider}>
      <SpeedMenu />
    </PlayerContext.Provider>
  )
  act(() => screen.getByRole("button", { name: /1x speed/i }).click()) // open
  act(() => screen.getByRole("menuitemradio", { name: "1.5x" }).click())
  expect(provider.getState().rate).toBe(1.5)
})

test("speed menu opens on the kino:open-speed event", () => {
  const fakeProvider = createFakeProvider({ rate: 1 })
  const { container } = render(
    <Player provider={fakeProvider}>
      <SpeedMenu />
    </Player>
  )
  expect(screen.queryByRole("menuitemradio", { name: "1.5x" })).toBeNull()
  const wrapper = container.querySelector(".kino") as HTMLElement
  act(() => {
    wrapper.dispatchEvent(new Event("kino:open-speed"))
  })
  expect(screen.getByRole("menuitemradio", { name: "1.5x" })).toBeVisible()
})

test("quality menu hidden when capability is off", () => {
  const provider = createFakeProvider()
  provider.set({
    capabilities: { ...provider.getState().capabilities, canSetQuality: false },
  })
  const { container } = render(
    <PlayerContext.Provider value={provider}>
      <QualityMenu />
    </PlayerContext.Provider>
  )
  expect(container.firstChild).toBeNull()
})
