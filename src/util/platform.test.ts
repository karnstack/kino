import { detectIOS } from "./platform"

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)"

test("detectIOS true for iPhone, false for desktop Mac", () => {
  expect(detectIOS(IPHONE)).toBe(true)
  expect(detectIOS(MAC)).toBe(false)
})

test("detectIOS treats a touch Macintosh UA as iPadOS desktop mode", () => {
  // iPadOS 13+ reports a Macintosh UA; touch points distinguish it from a Mac.
  expect(detectIOS(MAC, 5)).toBe(true)
  expect(detectIOS(MAC, 0)).toBe(false)
})
