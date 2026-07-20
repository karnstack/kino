import { createRoot } from "react-dom/client"
import { ScenesPlayer } from "../../src/scenes"
import "../../src/styles/kino.css"

// Standalone page (demo/scenes.html): embeds the demo lesson host with kino's
// chrome. Palette mirrors the docs site (ink / paper / leader amber).
const SANS =
  "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

function DemoPage() {
  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "48px 24px 64px",
        fontFamily: SANS,
        color: "#f3ede1",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 650,
            letterSpacing: "-0.01em",
          }}
        >
          kino scenes
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, color: "#a89e8e" }}>
          a lesson that is not a video file ·{" "}
          <a
            href="/scenes-host.html"
            style={{ color: "#f4b942", textDecorationColor: "#6e655a" }}
          >
            the iframe host page
          </a>
        </p>
      </header>
      <div style={{ aspectRatio: "16 / 9" }}>
        <ScenesPlayer
          src="/scenes-host.html"
          captions={{
            src: "/demo-lesson.vtt",
            label: "English",
            srclang: "en",
          }}
          metadata={{ videoTitle: "kino scenes demo" }}
          accentColor="#34d399"
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<DemoPage />)
