import type { Cues } from "./cues"

// A scene sequence is one audio file plus React scene modules mapped onto its
// timeline. start/end are global seconds; end includes the trailing silence
// gap after the scene's narration, during which the scene holds its final
// settled state.
export type SceneManifestScene = {
  id: string
  // Module URL resolving to { default: React.ComponentType }. Absolute, or
  // relative to the manifest URL.
  src: string
  start: number
  end: number
  cues: Cues
}

export type SceneManifest = {
  version: 1
  slug: string
  title?: string
  duration: number
  scenes: SceneManifestScene[]
  audio: Array<{ bitrate: number; src: string }>
  captions?: string
  poster?: string
  // Relative URL of a thumbnail VTT whose cues point into a sprite image via
  // #xywh fragments, the same format the Mux storyboard track uses. Consumed
  // by embedding players (scrubber hover previews), not by the host.
  storyboard?: string
  chapters?: Array<{ id: string; title: string; start: number }>
}

// Wire protocol, parent -> host. Types are namespaced with "kino:" so the
// host page can share a window with unrelated postMessage traffic.
export type HostCommand =
  | {
      type: "kino:init"
      rate: number
      volume: number
      muted: boolean
      autoPlay: boolean
      // Optional resume point in global sequence seconds. Used after the
      // iframe reloads from a cross-document move (document pip), so
      // playback continues where it left off.
      startTime?: number
      // Initial theme for the host document. Absent means dark.
      theme?: "light" | "dark"
    }
  | { type: "kino:play" }
  | { type: "kino:pause" }
  | { type: "kino:seek"; time: number }
  | { type: "kino:setRate"; rate: number }
  | { type: "kino:setVolume"; volume: number }
  | { type: "kino:setMuted"; muted: boolean }
  // Follows the embedding site's live theme toggle without reloading the
  // iframe.
  | { type: "kino:setTheme"; theme: "light" | "dark" }

// Host -> parent. `state` is emitted at ~10Hz while playing and immediately
// on every transition (play/pause/seek/ended/rate), which is enough
// precision for caption sync (~250ms) and the scrubber.
export type HostMediaState = {
  currentTime: number
  duration: number
  paused: boolean
  buffered: Array<[number, number]>
  seeking: boolean
  ended: boolean
  rate: number
  volume: number
  muted: boolean
  readyState: number
}

export type HostEvent =
  | { type: "kino:ready"; duration: number }
  | { type: "kino:state"; state: HostMediaState }
  | { type: "kino:scenechange"; id: string }
  | { type: "kino:error"; code: string; message: string }
