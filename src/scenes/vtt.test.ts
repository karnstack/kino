import { parseVtt, cueTextAt } from "./vtt"

const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.500
One server.

2
00:00:02.500 --> 00:01:05.120
Ten users.
Life is simple.

NOTE internal comment

00:01:05.120 --> 01:00:01.000
An hour later.
`

test("parseVtt reads cues with and without identifiers, skipping notes", () => {
  const cues = parseVtt(vtt)
  expect(cues).toHaveLength(3)
  expect(cues[0]).toEqual({ start: 0, end: 2.5, text: "One server." })
  expect(cues[1]?.start).toBe(2.5)
  expect(cues[1]?.end).toBeCloseTo(65.12, 5)
  expect(cues[1]?.text).toBe("Ten users.\nLife is simple.")
  expect(cues[2]?.end).toBeCloseTo(3601, 5)
})

test("parseVtt handles MM:SS.mmm timestamps without hours", () => {
  const cues = parseVtt("WEBVTT\n\n00:03.000 --> 00:04.250\nhi\n")
  expect(cues[0]?.start).toBe(3)
  expect(cues[0]?.end).toBe(4.25)
})

test("parseVtt accepts comma decimal separators", () => {
  const cues = parseVtt("WEBVTT\n\n00:03,000 --> 00:04,250\nhi\n")
  expect(cues[0]?.start).toBe(3)
  expect(cues[0]?.end).toBe(4.25)
})

test("parseVtt handles CRLF line endings", () => {
  const src =
    "WEBVTT\r\n\r\n1\r\n00:00:00.000 --> 00:00:02.500\r\nOne server.\r\n\r\n00:00:02.500 --> 00:00:05.000\r\nTen users.\r\n"
  const cues = parseVtt(src)
  expect(cues).toHaveLength(2)
  expect(cues[0]).toEqual({ start: 0, end: 2.5, text: "One server." })
  expect(cues[1]).toEqual({ start: 2.5, end: 5, text: "Ten users." })
})

test("cueTextAt returns the covering cue text or empty string", () => {
  const cues = parseVtt(vtt)
  expect(cueTextAt(cues, 1)).toBe("One server.")
  expect(cueTextAt(cues, 2.5)).toBe("Ten users.\nLife is simple.")
  expect(cueTextAt(cues, 3700)).toBe("")
  expect(cueTextAt([], 1)).toBe("")
})
