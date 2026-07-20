import { createSceneClock, emptyCues, type Cues } from "./cues"

const cues: Cues = {
  audioDuration: 10,
  cues: [
    { id: "server", t: 0 },
    { id: "users", t: 2 },
    { id: "works", t: 5 },
  ],
  words: [
    { w: "one", t0: 0, t1: 0.4 },
    { w: "server", t0: 0.5, t1: 1.0 },
    { w: "ten", t0: 2.0, t1: 2.3 },
  ],
}

test("cue() is false before the mark and true from the mark onward", () => {
  expect(createSceneClock(cues, 10, 1.9).cue("users")).toBe(false)
  expect(createSceneClock(cues, 10, 2).cue("users")).toBe(true)
  expect(createSceneClock(cues, 10, 9).cue("users")).toBe(true)
})

test("cue() honors offset and unknown ids are never true", () => {
  expect(createSceneClock(cues, 10, 2.4).cue("users", 0.5)).toBe(false)
  expect(createSceneClock(cues, 10, 2.5).cue("users", 0.5)).toBe(true)
  expect(createSceneClock(cues, 10, 9).cue("nope")).toBe(false)
})

test("between() with a cue id endpoint and with a numeric duration", () => {
  const at = (t: number) => createSceneClock(cues, 10, t)
  expect(at(1.9).between("users", "works")).toBe(false)
  expect(at(2).between("users", "works")).toBe(true)
  expect(at(5).between("users", "works")).toBe(true)
  expect(at(5.1).between("users", "works")).toBe(false)
  expect(at(3.4).between("users", 1.5)).toBe(true)
  expect(at(3.6).between("users", 1.5)).toBe(false)
})

test("progress() clamps and handles zero duration", () => {
  expect(createSceneClock(cues, 10, 5).progress()).toBe(0.5)
  expect(createSceneClock(cues, 10, 42).progress()).toBe(1)
  expect(createSceneClock(emptyCues, 0, 3).progress()).toBe(0)
})

test("currentWord() returns first word with t1 >= t, else words.length", () => {
  expect(createSceneClock(cues, 10, 0).currentWord()).toBe(0)
  expect(createSceneClock(cues, 10, 0.45).currentWord()).toBe(1)
  expect(createSceneClock(cues, 10, 3).currentWord()).toBe(3)
})
