import { formatTime } from "./format-time"

test("formats seconds under a minute", () => {
  expect(formatTime(3)).toBe("0:03")
})
test("formats minutes and seconds", () => {
  expect(formatTime(68)).toBe("1:08")
})
test("formats hours", () => {
  expect(formatTime(3661)).toBe("1:01:01")
})
test("clamps NaN and negatives to 0:00", () => {
  expect(formatTime(NaN)).toBe("0:00")
  expect(formatTime(-5)).toBe("0:00")
})
