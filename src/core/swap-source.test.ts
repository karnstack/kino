import { createFakeProvider } from "./fake-provider"
import type { Provider, SourceOptions } from "./types"

test("swapSource is optional: a provider without it satisfies Provider", () => {
  // createFakeProvider has no swapSource; it must still be a valid Provider.
  const provider: Provider = createFakeProvider()
  expect(provider.swapSource).toBeUndefined()
})

test("a provider may implement swapSource and receive SourceOptions", () => {
  const calls: SourceOptions[] = []
  const provider: Provider = {
    mount: () => {},
    getState: () => createFakeProvider().getState(),
    subscribe: () => () => {},
    actions: createFakeProvider().actions,
    destroy: () => {},
    swapSource: (opts) => {
      calls.push(opts)
    },
  }
  provider.swapSource?.({ src: "next.mp4" })
  expect(calls).toEqual([{ src: "next.mp4" }])
})
