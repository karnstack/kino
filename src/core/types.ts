export type QualityLevel = {
  id: string            // rendition id from the engine
  height: number        // e.g. 1080
  bitrate: number       // bits/sec
  selected: boolean     // currently the pinned manual selection
}

export type TextTrackInfo = {
  id: string
  kind: string          // "subtitles" | "captions" | ...
  label: string
  lang: string
  mode: "showing" | "hidden" | "disabled"
}

export type Capabilities = {
  canSetQuality: boolean
  hasStoryboard: boolean
  canPiP: boolean
  canFullscreen: boolean   // custom-chrome fullscreen (false on iPhone)
  canSetRate: boolean
  hasTextTracks: boolean
}

export type MediaError = { code: number; message: string }

export type MediaState = {
  paused: boolean
  currentTime: number
  duration: number
  buffered: Array<[number, number]>   // [start, end] seconds
  rate: number
  volume: number                       // 0..1
  muted: boolean
  readyState: number                   // HTMLMediaElement.readyState
  seeking: boolean
  ended: boolean
  error: MediaError | null
  qualities: QualityLevel[]
  activeQualityId: string | "auto"
  textTracks: TextTrackInfo[]
  activeTextTrackId: string | null
  fullscreen: boolean
  pip: boolean
  storyboard: { vttUrl: string } | null
  capabilities: Capabilities
}

export type PlayerActions = {
  play(): void
  pause(): void
  seek(time: number): void
  setRate(rate: number): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  setQuality(id: string | "auto"): void
  setTextTrack(id: string | null): void
  enterFullscreen(wrapper: HTMLElement): void
  exitFullscreen(): void
  enterPiP(): void
  exitPiP(): void
}

export interface Provider {
  mount(container: HTMLElement): void
  getState(): MediaState
  subscribe(listener: () => void): () => void
  actions: PlayerActions
  destroy(): void
}
