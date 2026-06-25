import { resolveKey, isTypingTarget } from "./keymap"

const ev = (init: Partial<KeyboardEvent>) => init as unknown as KeyboardEvent

test("space toggles play", () => {
  expect(resolveKey(ev({ key: " " }))).toEqual({ type: "toggle-play" })
})
test("arrows seek and adjust volume", () => {
  expect(resolveKey(ev({ key: "ArrowRight" }))).toEqual({
    type: "seek-by",
    delta: 5,
  })
  expect(resolveKey(ev({ key: "ArrowLeft" }))).toEqual({
    type: "seek-by",
    delta: -5,
  })
  expect(resolveKey(ev({ key: "ArrowUp" }))).toEqual({
    type: "volume-by",
    delta: 0.1,
  })
})
test("letters map to feature toggles", () => {
  expect(resolveKey(ev({ key: "f" }))).toEqual({ type: "toggle-fullscreen" })
  expect(resolveKey(ev({ key: "m" }))).toEqual({ type: "toggle-mute" })
  expect(resolveKey(ev({ key: "c" }))).toEqual({ type: "toggle-captions" })
  expect(resolveKey(ev({ key: "s" }))).toEqual({ type: "open-speed" })
})
test("digits seek to percent", () => {
  expect(resolveKey(ev({ key: "5" }))).toEqual({
    type: "seek-percent",
    percent: 50,
  })
})
test("modifier keys are ignored", () => {
  expect(resolveKey(ev({ key: " ", metaKey: true }))).toBeNull()
})
test("isTypingTarget guards inputs", () => {
  const input = document.createElement("input")
  expect(isTypingTarget(input)).toBe(true)
  expect(isTypingTarget(document.createElement("div"))).toBe(false)
})
