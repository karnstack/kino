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
