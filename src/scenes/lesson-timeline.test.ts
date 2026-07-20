import { sceneAt, localTime } from "./lesson-timeline"
import type { SceneManifestScene } from "./protocol"

const scene = (
  id: string,
  start: number,
  end: number,
  audioDuration: number,
): SceneManifestScene => ({
  id,
  src: `/scenes/${id}.js`,
  start,
  end,
  cues: { audioDuration, cues: [], words: [] },
})

// 24.16s narration + 0.5s gap, then a 10s scene, then a 5.34s closer.
// Typed as a tuple so indexing stays defined under noUncheckedIndexedAccess.
const scenes: [SceneManifestScene, SceneManifestScene, SceneManifestScene] = [
  scene("01", 0, 24.66, 24.16),
  scene("02", 24.66, 35.16, 10),
  scene("03", 35.16, 40.5, 5.34),
]

test("sceneAt picks the scene whose [start, end) contains t", () => {
  expect(sceneAt(scenes, 0)?.id).toBe("01")
  expect(sceneAt(scenes, 24.65)?.id).toBe("01")
  expect(sceneAt(scenes, 24.66)?.id).toBe("02")
  expect(sceneAt(scenes, 35)?.id).toBe("02")
})

test("sceneAt clamps outside the lesson to first/last scene", () => {
  expect(sceneAt(scenes, -1)?.id).toBe("01")
  expect(sceneAt(scenes, 40.5)?.id).toBe("03")
  expect(sceneAt(scenes, 999)?.id).toBe("03")
  expect(sceneAt([], 5)).toBe(null)
})

test("localTime maps global t into the scene and clamps to the narration", () => {
  expect(localTime(scenes[1], 24.66)).toBe(0)
  expect(localTime(scenes[1], 30)).toBeCloseTo(5.34, 5)
  // Inside the trailing gap the clock pins to audioDuration: the scene holds
  // its final settled state instead of running past its cues.
  expect(localTime(scenes[0], 24.5)).toBe(24.16)
  expect(localTime(scenes[1], 20)).toBe(0)
})
