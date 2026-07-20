// Minimal WebVTT parser for sidecar captions. The parent document has no
// media element to attach a <track> to, so the provider parses the file and
// computes the active cue itself. Handles the subset our pipeline emits:
// optional cue identifiers, HH:MM:SS.mmm or MM:SS.mmm timestamps, NOTE
// blocks. Styling/region/voice tags are not needed.
export type VttCue = { start: number; end: number; text: string }

const TIME = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/

function parseTimestamp(s: string): number | null {
  const m = TIME.exec(s)
  if (!m) return null
  const [, h, mm, ss, ms] = m
  if (mm === undefined || ss === undefined || ms === undefined) return null
  return (
    (h ? Number(h) * 3600 : 0) +
    Number(mm) * 60 +
    Number(ss) +
    Number(ms) / 1000
  )
}

export function parseVtt(src: string): VttCue[] {
  const out: VttCue[] = []
  // Cue blocks are separated by blank lines.
  const blocks = src.replace(/\r/g, "").split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l !== "")
    const head = lines[0]
    if (head === undefined) continue
    if (head.startsWith("WEBVTT") || head.startsWith("NOTE")) continue
    // The timing line is the first line containing "-->"; an optional cue
    // identifier line precedes it.
    const ti = lines.findIndex((l) => l.includes("-->"))
    if (ti === -1) continue
    const timing = lines[ti]
    if (timing === undefined) continue
    const [rawStart, rawEnd] = timing.split("-->")
    if (rawStart === undefined || rawEnd === undefined) continue
    const start = parseTimestamp(rawStart)
    const end = parseTimestamp(rawEnd)
    if (start == null || end == null) continue
    const text = lines.slice(ti + 1).join("\n")
    out.push({ start, end, text })
  }
  return out
}

export function cueTextAt(cues: VttCue[], t: number): string {
  for (const c of cues) {
    if (t >= c.start && t < c.end) return c.text
  }
  return ""
}
