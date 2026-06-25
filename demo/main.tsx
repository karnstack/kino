import { StrictMode, type CSSProperties } from "react"
import { createRoot } from "react-dom/client"
import { Player } from "../src/ui/player"
import { IdleOverlay } from "../src/ui/idle-overlay"
import { ControlBar } from "../src/ui/control-bar"
import { MuxPlayer } from "../src/mux/mux-player"
import { createFileProvider } from "./file-provider"
import "../src/styles/kino.css"

// A widely used public sample clip, so the harness plays a real video with no
// account and no signed tokens. This is the default view for anyone who clones
// the repo.
const SAMPLE_MP4 =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

const ACCENT = "oklch(50.8% 0.118 165.612)"

// Optional Mux section. Only renders when a playback id is provided via env, so
// the default experience never needs a Mux account.
const env = import.meta.env
const muxPlaybackId: string | undefined = env.VITE_MUX_PLAYBACK_ID

const frameStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
}

function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "48px 24px 80px",
        background:
          "radial-gradient(1200px 600px at 50% -10%, #1b2330, #0a0d12 60%)",
        color: "#e8edf2",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32,
      }}
    >
      <header style={{ maxWidth: 960, width: "100%", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 650 }}>
          kino playground
        </h1>
        <p style={{ margin: 0, color: "#9aa6b2", fontSize: 15 }}>
          The real kino glass UI playing a public sample clip. No account or
          tokens required.
        </p>
      </header>

      <section style={{ maxWidth: 960, width: "100%" }}>
        <div style={frameStyle}>
          <Player provider={createFileProvider(SAMPLE_MP4)} accentColor={ACCENT}>
            <IdleOverlay />
            <ControlBar />
          </Player>
        </div>
      </section>

      {muxPlaybackId ? (
        <section style={{ maxWidth: 960, width: "100%" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600 }}>
            Mux source
          </h2>
          <div style={frameStyle}>
            <MuxPlayer
              playbackId={muxPlaybackId}
              tokens={{
                playback: env.VITE_MUX_PLAYBACK_TOKEN,
                thumbnail: env.VITE_MUX_THUMBNAIL_TOKEN,
                storyboard: env.VITE_MUX_STORYBOARD_TOKEN,
              }}
              accentColor={ACCENT}
            />
          </div>
        </section>
      ) : null}
    </main>
  )
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("#root not found")
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
