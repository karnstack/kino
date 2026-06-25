import { parseStoryboard } from "./storyboard"

const SAMPLE = `WEBVTT

00:00:00.000 --> 00:00:05.000
storyboard.jpg#xywh=0,0,320,180

00:00:05.000 --> 00:00:10.000
storyboard.jpg#xywh=320,0,320,180
`

test("parses cues into tiles with xywh and time ranges", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.tiles).toHaveLength(2)
  expect(sb.tiles[0]).toMatchObject({
    url: "https://image.mux.com/ID/storyboard.jpg",
    x: 0, y: 0, w: 320, h: 180, start: 0, end: 5,
  })
  expect(sb.tiles[1]?.x).toBe(320)
})

test("thumbnailAt returns the tile covering the time", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.thumbnailAt(2)?.x).toBe(0)
  expect(sb.thumbnailAt(7)?.x).toBe(320)
})

test("thumbnailAt clamps past the end to the last tile", () => {
  const sb = parseStoryboard(SAMPLE, "https://image.mux.com/ID/")
  expect(sb.thumbnailAt(999)?.x).toBe(320)
})

test("returns empty storyboard for blank input", () => {
  expect(parseStoryboard("WEBVTT\n", "x").tiles).toHaveLength(0)
  expect(parseStoryboard("WEBVTT\n", "x").thumbnailAt(1)).toBeNull()
})
