function joinCues(cues: ArrayLike<TextTrackCue> | null | undefined): string {
  if (!cues || cues.length === 0) return ""
  const parts: string[] = []
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i] as VTTCue
    if (c && typeof c.text === "string") parts.push(c.text)
  }
  return parts
    .join("\n") // multiple simultaneous cues stack, one per line
    .replace(/<[^>]+>/g, "") // strip VTT tags (<v>, <c>, timestamps)
    .replace(/[^\S\n]+/g, " ") // collapse spaces/tabs but keep author line breaks
    .replace(/ *\n */g, "\n") // trim spaces hugging a line break
    .replace(/\n{2,}/g, "\n") // no blank lines
    .trim()
}

// Text of whatever subtitle/caption cue is active right now. Prefers the
// browser's activeCues, but falls back to scanning all cues by time since some
// engines (hls.js) don't keep activeCues in sync when the mode is "hidden".
export function activeCueText(
  tracks: ArrayLike<TextTrack> | null | undefined,
  now: number,
): string {
  if (!tracks) return ""
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    if (!t) continue
    if (t.kind !== "subtitles" && t.kind !== "captions") continue
    if (t.mode === "disabled") continue
    const active = joinCues(t.activeCues)
    if (active) return active
    const all = t.cues
    if (all && all.length) {
      const hits: TextTrackCue[] = []
      for (let j = 0; j < all.length; j++) {
        const c = all[j]
        if (c && c.startTime <= now && now < c.endTime) hits.push(c)
      }
      const text = joinCues(hits)
      if (text) return text
    }
  }
  return ""
}
