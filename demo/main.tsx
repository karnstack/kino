import { useState, type CSSProperties } from "react"
import { createRoot } from "react-dom/client"
import { MuxPlayer } from "../src/mux/mux-player"
import "../src/styles/kino.css"

// Two public Mux assets (no signed tokens needed), so the harness plays real
// HLS video, storyboard scrub previews, and quality switching out of the box.
const SAMPLE_A = "01b2r4H6Pg8Q01NJZGppCu6X6tmfP6f6Jtp5oFZaETUwU"
const SAMPLE_B = "a4nOgmxGWg6gULfcBbAa00gXyfcwPnAFldF8RdsNyk8M"

const ACCENT = "oklch(50.8% 0.118 165.612)"

const frameStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
}

function App() {
  // Toggle the playback id to exercise swapSource: MuxPlayer keeps the same
  // <mux-video> element mounted and reloads the new source on it, so a
  // fullscreen session survives the swap.
  const [playbackId, setPlaybackId] = useState(SAMPLE_A)
  const swap = () =>
    setPlaybackId((id) => (id === SAMPLE_A ? SAMPLE_B : SAMPLE_A))

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
          The real kino glass UI on the Mux provider, playing public sample
          assets. No account or signed tokens required.
        </p>
      </header>

      <section style={{ maxWidth: 960, width: "100%" }}>
        <div style={frameStyle}>
          <MuxPlayer playbackId={playbackId} accentColor={ACCENT} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={swap}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(255, 255, 255, 0.06)",
              color: "#e8edf2",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Swap source
          </button>
          <p style={{ margin: 0, color: "#9aa6b2", fontSize: 13 }}>
            Swapping reloads a new asset on the same media element via
            swapSource, so the player never remounts and a fullscreen session
            survives the change. Current id: {playbackId}
          </p>
        </div>
      </section>
    </main>
  )
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("#root not found")
createRoot(rootEl).render(<App />)
