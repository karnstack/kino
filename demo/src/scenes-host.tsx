import {
  createSceneHost,
  useSceneTimeline,
  type SceneManifest,
} from "../../src/scenes"

function SceneOne() {
  const t = useSceneTimeline()
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
        color: "#fafafa",
        display: "grid",
        placeItems: "center",
        fontSize: 120,
      }}
    >
      <div>
        {t.cue("start") && <div>one server</div>}
        {t.cue("mid") && <div style={{ color: "#34d399" }}>ten users</div>}
      </div>
    </div>
  )
}

function SceneTwo() {
  const t = useSceneTimeline()
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#111827",
        color: "#fafafa",
        display: "grid",
        placeItems: "center",
        fontSize: 120,
      }}
    >
      <div style={{ opacity: t.progress() }}>
        scene two, progress {Math.round(t.progress() * 100)}%
      </div>
    </div>
  )
}

const manifest: SceneManifest = {
  version: 1,
  slug: "fixture",
  duration: 12,
  scenes: [
    {
      id: "01",
      src: "inline",
      start: 0,
      end: 6,
      cues: {
        audioDuration: 6,
        cues: [
          { id: "start", t: 0.5 },
          { id: "mid", t: 3 },
        ],
        words: [],
      },
    },
    {
      id: "02",
      src: "inline",
      start: 6,
      end: 12,
      cues: { audioDuration: 6, cues: [], words: [] },
    },
  ],
  audio: [{ bitrate: 128, src: "/fixture-lesson.mp3" }],
}

createSceneHost({
  container: document.getElementById("root")!,
  manifest,
  loadScene: (id) =>
    Promise.resolve({ default: id === "01" ? SceneOne : SceneTwo }),
})
