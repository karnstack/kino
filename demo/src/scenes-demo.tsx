import { createRoot } from "react-dom/client"
import { ScenesPlayer } from "../../src/scenes"
import "../../src/styles/kino.css"

createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 960, margin: "40px auto", aspectRatio: "16 / 9" }}>
    <ScenesPlayer
      src="/scenes-host.html"
      metadata={{ videoTitle: "fixture lesson" }}
    />
  </div>,
)
