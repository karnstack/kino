// Cue timing for one scene, produced at authoring time from whisper word
// timings. Same shape the private video pipeline writes to cues.json.
export type CueMark = {
  id: string
  t: number
  label?: string
}

export type CueWord = {
  w: string
  t0: number
  t1: number
}

export type Cues = {
  title?: string
  audioDuration: number
  cues: CueMark[]
  words: CueWord[]
}

export const emptyCues: Cues = {
  audioDuration: 0,
  cues: [],
  words: [],
}

// The scene-facing clock. Scenes call these every render; all methods are
// pure over (cues, duration, t) so a scene's output is a function of time.
export type SceneClock = {
  t: number
  duration: number
  cues: Cues
  cue(id: string, offset?: number): boolean
  between(
    fromId: string,
    toIdOrOffset: string | number,
    offset?: number,
  ): boolean
  progress(): number
  currentWord(): number
}

export function createSceneClock(
  cues: Cues,
  duration: number,
  t: number,
): SceneClock {
  const cueAt = (id: string): number | null => {
    const c = cues.cues.find((c) => c.id === id)
    return c ? c.t : null
  }
  return {
    t,
    duration,
    cues,
    cue(id, offset = 0) {
      const at = cueAt(id)
      return at !== null && t >= at + offset
    },
    between(fromId, toIdOrOffset, offset) {
      const from = cueAt(fromId)
      if (from === null) return false
      let to: number
      if (typeof toIdOrOffset === "number") {
        to = from + toIdOrOffset
      } else {
        const x = cueAt(toIdOrOffset)
        if (x === null) return false
        to = x + (offset ?? 0)
      }
      return t >= from && t <= to
    },
    progress() {
      if (!duration) return 0
      return Math.min(1, Math.max(0, t / duration))
    },
    currentWord() {
      const ws = cues.words
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i]
        if (w && w.t1 >= t) return i
      }
      return ws.length
    },
  }
}
