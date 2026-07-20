// The kino scenes demo lesson. Three scenes mapped onto one 41.8s narration
// track (/demo-lesson.mp3). Every cue `t` below is the whisper t0 of the word
// the visual lands on, scene-local seconds. Scenes are pure functions of the
// timeline: all motion is CSS transitions gated on cue booleans plus values
// derived from t, so seeking in either direction always settles correctly.
import type { CSSProperties, ComponentType, ReactNode } from "react"
import {
  createSceneHost,
  useSceneTimeline,
  type CueMark,
  type CueWord,
  type SceneClock,
  type SceneManifest,
} from "../../src/scenes"

const ACCENT = "#34d399"
const SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
const MONO =
  "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(1200px 700px at 50% 32%, #111827 0%, #0a0a0a 70%)",
        color: "#fafafa",
        fontFamily: SANS,
      }}
    >
      {children}
    </div>
  )
}

// Fade-and-rise entrance gated on a cue boolean. Rendering transparent (not
// unmounting) keeps layout stable and lets exits play when seeking backwards.
function Reveal({
  on,
  dy = 18,
  style,
  children,
}: {
  on: boolean
  dy?: number
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0)" : `translateY(${dy}px)`,
        transition: "opacity 350ms ease-out, transform 350ms ease-out",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── scene 01: this is not a video ────────────────────────────────────────

function FileChip({
  on,
  pixelsOff,
  struck,
}: {
  on: boolean
  pixelsOff: boolean
  struck: boolean
}) {
  return (
    <div
      style={{
        width: 400,
        height: 260,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "36px 48px",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          textAlign: "center",
          opacity: on ? (struck ? 0.35 : 1) : 0,
          transform: on ? "translateY(0)" : "translateY(18px)",
          transition: "opacity 350ms ease-out, transform 350ms ease-out",
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 46, color: "#fafafa" }}>
          lesson.mp4
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 22,
            marginTop: 14,
            color: "rgba(255,255,255,0.55)",
            opacity: pixelsOff ? 0.3 : 1,
            transition: "opacity 350ms ease-out",
          }}
        >
          h.264 · 1080p · streaming
        </div>
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: "50%",
            height: 3,
            borderRadius: 2,
            background: "rgba(250,250,250,0.9)",
            transform: struck ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: "left center",
            transition: "transform 350ms ease-out",
          }}
        />
      </div>
    </div>
  )
}

function Atom() {
  const orbit: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 150,
    height: 58,
    marginLeft: -75,
    marginTop: -29,
    border: "2.5px solid rgba(52,211,153,0.85)",
    borderRadius: "50%",
  }
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      {[0, 60, 120].map((deg) => (
        <div key={deg} style={{ ...orbit, transform: `rotate(${deg}deg)` }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 18,
          height: 18,
          margin: -9,
          borderRadius: "50%",
          background: ACCENT,
        }}
      />
    </div>
  )
}

function SceneBadge({
  on,
  framed,
  progress,
}: {
  on: boolean
  framed: boolean
  progress: number
}) {
  return (
    <div style={{ position: "relative", width: 400, height: 260 }}>
      {/* the "video player" chrome that the component is mounted inside */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 24,
          border: "2px solid rgba(255,255,255,0.18)",
          opacity: framed ? 1 : 0,
          transition: "opacity 350ms ease-out",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "9px solid transparent",
              borderBottom: "9px solid transparent",
              borderLeft: "14px solid rgba(255,255,255,0.7)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background: ACCENT,
              }}
            />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          opacity: on ? 1 : 0,
          transform: on ? "translateY(0)" : "translateY(18px)",
          transition: "opacity 350ms ease-out, transform 350ms ease-out",
        }}
      >
        <Atom />
        <div
          style={{
            fontFamily: MONO,
            fontSize: 30,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {"<Scene />"}
        </div>
      </div>
    </div>
  )
}

function Waveform({ on, t }: { on: boolean; t: number }) {
  const bars = 28
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 80,
        height: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: on ? 1 : 0,
        transition: "opacity 350ms ease-out",
      }}
    >
      {Array.from({ length: bars }, (_, i) => {
        const env = Math.sin((Math.PI * (i + 0.5)) / bars)
        const wob = 0.55 + 0.45 * Math.sin(t * 7 + i * 1.9)
        return (
          <div
            key={i}
            style={{
              width: 8,
              height: 8 + 64 * env * wob,
              borderRadius: 4,
              background: ACCENT,
              opacity: 0.35 + 0.65 * env,
            }}
          />
        )
      })}
    </div>
  )
}

function SceneNotAVideo() {
  const t = useSceneTimeline()
  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 96,
          paddingBottom: 130,
        }}
      >
        <Reveal on={t.cue("not_a_video")}>
          <h1
            style={{
              margin: 0,
              fontSize: 112,
              fontWeight: 650,
              letterSpacing: "-0.03em",
            }}
          >
            this is <span style={{ color: ACCENT }}>not</span> a video
          </h1>
        </Reveal>
        <div style={{ display: "flex", alignItems: "center", gap: 120 }}>
          <FileChip
            on={t.cue("file_chip")}
            pixelsOff={t.cue("no_pixels")}
            struck={t.cue("no_codec")}
          />
          <SceneBadge
            on={t.cue("react_component")}
            framed={t.cue("video_player")}
            progress={t.progress()}
          />
        </div>
      </div>
      <Waveform on={t.cue("voice_wave")} t={t.t} />
    </Stage>
  )
}

// ── scene 02: named cues fire on word boundaries ─────────────────────────

const RAIL_CHIP_IDS = [
  "cues_fire",
  "word_boundaries",
  "visuals_react",
  "pause_me",
  "scrub",
  "live_dom",
]

function CueRail({ t }: { t: SceneClock }) {
  const pct = Math.min(100, Math.max(0, (t.t / t.duration) * 100))
  const marks = RAIL_CHIP_IDS.map((id) => ({
    id,
    at: t.cues.cues.find((c) => c.id === id)?.t ?? 0,
  }))
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 20,
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.35)",
          marginBottom: 6,
        }}
      >
        named cues
      </div>
      <div style={{ position: "relative", height: 150 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 2,
            marginTop: -1,
            borderRadius: 1,
            background: "rgba(255,255,255,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            top: "50%",
            height: 2,
            marginTop: -1,
            borderRadius: 1,
            background: "rgba(52,211,153,0.8)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: "50%",
            width: 12,
            height: 12,
            margin: -6,
            borderRadius: "50%",
            background: ACCENT,
            boxShadow: "0 0 16px rgba(52,211,153,0.8)",
          }}
        />
        {marks.map((m, i) => {
          const lit = t.cue(m.id)
          const left = `${(m.at / t.duration) * 100}%`
          const chipPos: CSSProperties =
            i % 2 === 0
              ? { bottom: "calc(50% + 22px)" }
              : { top: "calc(50% + 22px)" }
          return (
            <div key={m.id}>
              <div
                style={{
                  position: "absolute",
                  left,
                  top: "50%",
                  width: 10,
                  height: 10,
                  margin: -5,
                  borderRadius: "50%",
                  background: lit ? ACCENT : "rgba(255,255,255,0.25)",
                  transition: "background 300ms ease-out",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left,
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontFamily: MONO,
                  fontSize: 21,
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: `1px solid ${lit ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.14)"}`,
                  color: lit ? "#d9fbee" : "rgba(255,255,255,0.4)",
                  background: lit
                    ? "rgba(52,211,153,0.1)"
                    : "rgba(255,255,255,0.03)",
                  boxShadow: lit ? "0 0 28px rgba(52,211,153,0.35)" : "none",
                  transition:
                    "border-color 300ms ease-out, color 300ms ease-out, background 300ms ease-out, box-shadow 300ms ease-out",
                  ...chipPos,
                }}
              >
                {m.id}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SceneCuesFire() {
  const t = useSceneTimeline()
  const current = t.currentWord()
  const flash = t.between("live_dom", 1.4)
  return (
    <Stage>
      {/* everything on this stage is live DOM; flash its outline to prove it */}
      <div
        style={{
          position: "absolute",
          inset: 36,
          borderRadius: 28,
          border: flash
            ? "2px solid rgba(52,211,153,0.75)"
            : "2px solid rgba(52,211,153,0)",
          boxShadow: flash ? "inset 0 0 80px rgba(52,211,153,0.15)" : "none",
          transition: "border-color 350ms ease-out, box-shadow 350ms ease-out",
          pointerEvents: "none",
        }}
      />
      <Reveal
        on={t.cue("live_dom")}
        style={{ position: "absolute", top: 58, right: 66 }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 24,
            color: ACCENT,
            border: "1px solid rgba(52,211,153,0.5)",
            borderRadius: 999,
            padding: "8px 20px",
            background: "rgba(52,211,153,0.08)",
          }}
        >
          live dom
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 90,
          padding: "0 160px",
        }}
      >
        <Reveal on={t.cue("rail_in")} style={{ width: "100%" }}>
          <CueRail t={t} />
        </Reveal>
        <Reveal on={t.cue("rail_in")}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              maxWidth: 1500,
              fontSize: 34,
              lineHeight: 1.6,
            }}
          >
            {t.cues.words.map((wd, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 8px",
                  color:
                    i === current
                      ? ACCENT
                      : i < current
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.2)",
                  textShadow:
                    i === current ? "0 0 24px rgba(52,211,153,0.5)" : "none",
                  transition: "color 180ms ease-out",
                }}
              >
                {wd.w}
              </span>
            ))}
          </div>
        </Reveal>
        <Reveal on={t.cue("pause_me")}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 26,
                color: "#fafafa",
                padding: "12px 34px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.3)",
                borderBottomWidth: 3,
                background: "rgba(255,255,255,0.05)",
              }}
            >
              space
            </div>
            <div style={{ fontSize: 26, color: "rgba(255,255,255,0.5)" }}>
              pause me, scrub the timeline
            </div>
          </div>
        </Reveal>
      </div>
    </Stage>
  )
}

// ── scene 03: resolution independent ─────────────────────────────────────

function SizeChip({
  on,
  perfect,
  label,
  fontSize,
}: {
  on: boolean
  perfect: boolean
  label: string
  fontSize: number
}) {
  return (
    <div
      style={{
        opacity: on ? 1 : 0,
        transform: on
          ? "translateY(0) scale(1)"
          : "translateY(18px) scale(0.96)",
        transition: "opacity 350ms ease-out, transform 350ms ease-out",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize,
          lineHeight: 1,
          padding: "0.28em 0.5em",
          borderRadius: "0.22em",
          border: `1.5px solid ${perfect ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.2)"}`,
          color: "#fafafa",
          background: perfect
            ? "rgba(52,211,153,0.07)"
            : "rgba(255,255,255,0.03)",
          transition: "border-color 350ms ease-out, background 350ms ease-out",
        }}
      >
        {label}
      </div>
    </div>
  )
}

function WordTicks({
  words,
  duration,
  current,
  on,
}: {
  words: CueWord[]
  duration: number
  current: number
  on: boolean
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 680,
        height: 16,
        opacity: on ? 1 : 0,
        transition: "opacity 350ms ease-out",
      }}
    >
      {words.map((wd, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${(wd.t0 / duration) * 100}%`,
            top: 0,
            width: 2.5,
            height: 16,
            borderRadius: 1,
            background: i <= current ? ACCENT : "rgba(255,255,255,0.22)",
            transition: "background 200ms ease-out",
          }}
        />
      ))}
    </div>
  )
}

function SceneResolutionIndependent() {
  const t = useSceneTimeline()
  const outro = t.cue("wordmark")
  const perfect = t.cue("pixel_perfect")
  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 70,
          opacity: outro ? 0 : 1,
          transition: "opacity 400ms ease-out",
        }}
      >
        <Reveal on={t.cue("resolution_independent")}>
          <h1
            style={{
              margin: 0,
              fontSize: 84,
              fontWeight: 650,
              letterSpacing: "-0.02em",
            }}
          >
            resolution independent
          </h1>
        </Reveal>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 90 }}>
          <Reveal on={t.cue("markup")}>
            <div
              style={{
                fontSize: 300,
                fontWeight: 600,
                lineHeight: 0.9,
                letterSpacing: "-0.04em",
              }}
            >
              Aa
            </div>
          </Reveal>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 24,
              paddingBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
              <SizeChip
                on={t.cue("chip_4k")}
                perfect={perfect}
                label="4k"
                fontSize={84}
              />
              <SizeChip
                on={t.cue("chip_retina")}
                perfect={perfect}
                label="retina"
                fontSize={52}
              />
              <SizeChip
                on={t.cue("chip_phone")}
                perfect={perfect}
                label="phone"
                fontSize={32}
              />
            </div>
            <Reveal on={perfect}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 22,
                  letterSpacing: "0.08em",
                  color: ACCENT,
                }}
              >
                all pixel perfect
              </div>
            </Reveal>
          </div>
        </div>
        <Reveal on={t.cue("caption_pill")}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 32,
                padding: "16px 34px",
                borderRadius: 14,
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              these subtitles come from the same word timings
            </div>
            <WordTicks
              words={t.cues.words}
              duration={t.duration}
              current={t.currentWord()}
              on={t.cue("word_timings")}
            />
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          opacity: outro ? 1 : 0,
          transform: outro ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 400ms ease-out, transform 400ms ease-out",
          pointerEvents: "none",
        }}
      >
        <div
          style={{ fontSize: 130, fontWeight: 700, letterSpacing: "-0.03em" }}
        >
          kino <span style={{ color: ACCENT }}>scenes</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 30,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          audio in, React out
        </div>
      </div>
    </Stage>
  )
}

// ── manifest ─────────────────────────────────────────────────────────────

const c = (id: string, t: number): CueMark => ({ id, t })
const w = (word: string, t0: number, t1: number): CueWord => ({
  w: word,
  t0,
  t1,
})

const manifest: SceneManifest = {
  version: 1,
  slug: "demo-lesson",
  duration: 41.8,
  scenes: [
    {
      id: "01",
      src: "inline",
      start: 0,
      end: 12.6,
      cues: {
        audioDuration: 11.6,
        cues: [
          c("not_a_video", 1.48),
          c("file_chip", 2.2),
          c("no_pixels", 3.34),
          c("no_codec", 4.98),
          c("react_component", 6.44),
          c("video_player", 8.76),
          c("voice_wave", 10.56),
        ],
        words: [
          w("What", 0, 0.2),
          w("you're", 0.2, 0.36),
          w("watching", 0.36, 0.6),
          w("right", 0.6, 0.88),
          w("now", 0.88, 1.18),
          w("is", 1.18, 1.48),
          w("not", 1.48, 1.74),
          w("a", 1.74, 1.94),
          w("video", 1.94, 2.2),
          w("file.", 2.2, 2.64),
          w("No", 3.22, 3.34),
          w("pixels", 3.34, 3.64),
          w("are", 3.64, 3.84),
          w("streaming,", 3.84, 4.16),
          w("there's", 4.68, 4.84),
          w("no", 4.84, 4.98),
          w("codec.", 4.98, 5.52),
          w("This", 6.04, 6.2),
          w("is", 6.2, 6.34),
          w("a", 6.34, 6.44),
          w("React", 6.44, 6.76),
          w("component,", 6.76, 7.48),
          w("mounted", 7.94, 8.26),
          w("inside", 8.26, 8.62),
          w("a", 8.62, 8.76),
          w("video", 8.76, 9.02),
          w("player,", 9.02, 9.44),
          w("synced", 9.72, 10.26),
          w("to", 10.26, 10.46),
          w("the", 10.46, 10.56),
          w("sound", 10.56, 10.8),
          w("of", 10.8, 10.94),
          w("my", 10.94, 11.06),
          w("voice.", 11.06, 11.36),
        ],
      },
    },
    {
      id: "02",
      src: "inline",
      start: 12.6,
      end: 27.04,
      cues: {
        audioDuration: 13.44,
        cues: [
          c("rail_in", 0.12),
          c("cues_fire", 3.78),
          c("word_boundaries", 4.84),
          c("visuals_react", 6.36),
          c("pause_me", 8.44),
          c("scrub", 9.42),
          c("live_dom", 12.86),
        ],
        words: [
          w("The", 0, 0.12),
          w("audio", 0.12, 0.44),
          w("is", 0.44, 0.72),
          w("the", 0.72, 0.86),
          w("only", 0.86, 1.14),
          w("real", 1.14, 1.44),
          w("file", 1.44, 1.76),
          w("here.", 1.76, 2.08),
          w("As", 2.64, 2.76),
          w("I", 2.76, 2.88),
          w("speak,", 2.88, 3.12),
          w("named", 3.5, 3.78),
          w("cues", 3.78, 4.16),
          w("fire", 4.16, 4.6),
          w("on", 4.6, 4.84),
          w("word", 4.84, 5.14),
          w("boundaries", 5.14, 5.62),
          w("and", 5.62, 5.96),
          w("the", 5.96, 6.04),
          w("visuals", 6.04, 6.36),
          w("react", 6.36, 6.76),
          w("to", 6.76, 7),
          w("them.", 7, 7.16),
          w("Go", 7.82, 7.96),
          w("ahead,", 7.96, 8.18),
          w("pause", 8.44, 8.64),
          w("me.", 8.64, 8.9),
          w("Scrub", 9.42, 9.72),
          w("the", 9.72, 9.82),
          w("timeline.", 9.82, 10.14),
          w("Every", 10.78, 11.12),
          w("frame", 11.12, 11.48),
          w("you", 11.48, 11.76),
          w("see", 11.76, 12.06),
          w("is", 12.06, 12.4),
          w("live", 12.4, 12.86),
          w("DOM.", 12.86, 13.24),
        ],
      },
    },
    {
      id: "03",
      src: "inline",
      start: 27.04,
      end: 41.8,
      cues: {
        audioDuration: 13.76,
        cues: [
          c("markup", 0.64),
          c("resolution_independent", 1.5),
          c("chip_4k", 3.16),
          c("chip_retina", 4.32),
          c("chip_phone", 5.4),
          c("pixel_perfect", 6.32),
          c("caption_pill", 7.84),
          c("word_timings", 9.3),
          c("wordmark", 12.46),
        ],
        words: [
          w("Because", 0, 0.28),
          w("it's", 0.28, 0.5),
          w("just", 0.5, 0.64),
          w("markup,", 0.64, 1.18),
          w("it", 1.3, 1.38),
          w("is", 1.38, 1.5),
          w("resolution", 1.5, 2.02),
          w("independent.", 2.02, 2.5),
          w("4K,", 3.16, 3.72),
          w("a", 4.24, 4.32),
          w("retina", 4.32, 4.62),
          w("laptop,", 4.62, 5),
          w("a", 5.34, 5.4),
          w("phone,", 5.4, 5.72),
          w("all", 6.16, 6.32),
          w("pixel", 6.32, 6.68),
          w("perfect.", 6.68, 7.1),
          w("These", 7.6, 7.84),
          w("subtitles", 7.84, 8.2),
          w("come", 8.2, 8.66),
          w("from", 8.66, 8.84),
          w("the", 8.84, 8.96),
          w("same", 8.96, 9.3),
          w("word", 9.3, 9.6),
          w("timings.", 9.6, 10.22),
          w("And", 10.46, 10.72),
          w("when", 10.72, 10.84),
          w("the", 10.84, 10.98),
          w("author", 10.98, 11.22),
          w("edits", 11.22, 11.48),
          w("a", 11.48, 11.66),
          w("scene,", 11.66, 11.98),
          w("there", 12.22, 12.32),
          w("is", 12.32, 12.46),
          w("nothing", 12.46, 12.78),
          w("to", 12.78, 13.08),
          w("re", 13.08, 13.24),
          w("-render.", 13.24, 13.54),
        ],
      },
    },
  ],
  audio: [{ bitrate: 192, src: "/demo-lesson.mp3" }],
  captions: "/demo-lesson.vtt",
}

const sceneModules: Record<string, ComponentType> = {
  "01": SceneNotAVideo,
  "02": SceneCuesFire,
  "03": SceneResolutionIndependent,
}

createSceneHost({
  container: document.getElementById("root")!,
  manifest,
  loadScene: (id) => {
    const scene = sceneModules[id]
    return scene
      ? Promise.resolve({ default: scene })
      : Promise.reject(new Error(`unknown scene ${id}`))
  },
})
