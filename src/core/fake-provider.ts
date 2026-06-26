import type { MediaState, Provider, PlayerActions } from "./types"

const DEFAULT_CAPS = {
  canSetQuality: true, hasStoryboard: false, canPiP: true,
  canFullscreen: true, canSetRate: true, hasTextTracks: false,
}

export function defaultState(): MediaState {
  return {
    paused: true, currentTime: 0, duration: 0, buffered: [],
    rate: 1, volume: 1, muted: false, readyState: 0, seeking: false,
    ended: false, error: null, qualities: [], activeQualityId: "auto", videoHeight: 0,
    textTracks: [], activeTextTrackId: null, activeCueText: "",
    fullscreen: false, pip: false,
    storyboard: null, capabilities: { ...DEFAULT_CAPS },
  }
}

export function createFakeProvider(initial?: Partial<MediaState>) {
  let state: MediaState = { ...defaultState(), ...initial }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const set = (patch: Partial<MediaState>) => {
    state = { ...state, ...patch }
    emit()
  }
  const actions: PlayerActions = {
    play: () => set({ paused: false }),
    pause: () => set({ paused: true }),
    seek: (t) => set({ currentTime: t }),
    setRate: (rate) => set({ rate }),
    setVolume: (v) => set({ volume: v }),
    setMuted: (m) => set({ muted: m }),
    setQuality: (id) => set({ activeQualityId: id }),
    setTextTrack: (id) => set({ activeTextTrackId: id }),
    enterFullscreen: () => set({ fullscreen: true }),
    exitFullscreen: () => set({ fullscreen: false }),
    enterPiP: () => set({ pip: true }),
    exitPiP: () => set({ pip: false }),
  }
  const provider: Provider = {
    mount: () => {},
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
    actions,
    destroy: () => listeners.clear(),
  }
  return Object.assign(provider, { set })
}
