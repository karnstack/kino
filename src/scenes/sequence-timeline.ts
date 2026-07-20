import type { SceneManifestScene } from "./protocol"

// Which scene owns global time t. Ranges are [start, end); t outside the
// sequence clamps to the first/last scene so the stage is never empty while
// the audio element reports edge times.
export function sceneAt(
  scenes: SceneManifestScene[],
  t: number,
): SceneManifestScene | null {
  const first = scenes[0]
  if (first === undefined) return null
  if (t < first.start) return first
  for (const s of scenes) {
    if (t >= s.start && t < s.end) return s
  }
  return scenes[scenes.length - 1] ?? first
}

// Scene-local clock value for global time t. Clamped to the narration length
// so the trailing silence gap holds the final settled state.
export function localTime(scene: SceneManifestScene, t: number): number {
  return Math.max(0, Math.min(scene.cues.audioDuration, t - scene.start))
}
