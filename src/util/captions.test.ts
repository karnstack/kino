import { activeCueText } from "./captions"

const cue = (startTime: number, endTime: number, text: string) =>
  ({ startTime, endTime, text }) as unknown as TextTrackCue

type FakeTrack = {
  kind: string
  mode: TextTrackMode
  activeCues: TextTrackCue[] | null
  cues: TextTrackCue[] | null
}
const track = (over: Partial<FakeTrack> = {}): TextTrack => {
  const base: FakeTrack = {
    kind: "subtitles",
    mode: "hidden",
    activeCues: null,
    cues: null,
  }
  return { ...base, ...over } as unknown as TextTrack
}

test("reads the active cue text", () => {
  const t = track({ activeCues: [cue(0, 2, "hello world")] })
  expect(activeCueText([t], 1)).toBe("hello world")
})

test("falls back to scanning cues by time when activeCues is empty", () => {
  const t = track({
    activeCues: [],
    cues: [cue(0, 1, "a"), cue(5, 7, "target"), cue(10, 11, "b")],
  })
  expect(activeCueText([t], 6)).toBe("target")
})

test("ignores disabled tracks", () => {
  const t = track({ mode: "disabled", activeCues: [cue(0, 2, "nope")] })
  expect(activeCueText([t], 1)).toBe("")
})

test("ignores non-subtitle/caption kinds", () => {
  const t = track({ kind: "metadata", activeCues: [cue(0, 2, "meta")] })
  expect(activeCueText([t], 1)).toBe("")
})

test("strips markup, collapses spaces, but keeps author line breaks", () => {
  const t = track({ activeCues: [cue(0, 2, "<v Bob>hi   there</v>\nfriend")] })
  expect(activeCueText([t], 1)).toBe("hi there\nfriend")
})

test("stacks multiple simultaneous cues one per line", () => {
  const t = track({
    activeCues: [cue(0, 2, "line one"), cue(0, 2, "line two")],
  })
  expect(activeCueText([t], 1)).toBe("line one\nline two")
})

test("empty when nothing is active", () => {
  const t = track({ activeCues: [], cues: [cue(5, 7, "later")] })
  expect(activeCueText([t], 1)).toBe("")
})
