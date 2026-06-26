import { buildImageUrl, detectIOS } from "./urls"

test("buildImageUrl composes signed storyboard url", () => {
  expect(buildImageUrl("ID", "storyboard", "JWT")).toBe(
    "https://image.mux.com/ID/storyboard.vtt?token=JWT",
  )
})
test("buildImageUrl omits token when unsigned", () => {
  expect(buildImageUrl("ID", "thumbnail")).toBe(
    "https://image.mux.com/ID/thumbnail.webp",
  )
})
test("detectIOS true for iPhone UA, false for desktop", () => {
  expect(
    detectIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
  ).toBe(true)
  expect(detectIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe(false)
})
