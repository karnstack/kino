import { createContext, useContext, useRef, useSyncExternalStore } from "react"
import type { MediaState, PlayerActions, Provider } from "./types"

export const PlayerContext = createContext<Provider | null>(null)

function useProvider(): Provider {
  const p = useContext(PlayerContext)
  if (!p) throw new Error("kino: components must render inside <Player>")
  return p
}

export function useMediaSelector<T>(
  selector: (s: MediaState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const provider = useProvider()
  const cache = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as never })
  const getSnapshot = () => {
    const next = selector(provider.getState())
    if (cache.current.has && isEqual(cache.current.value, next)) return cache.current.value
    cache.current = { has: true, value: next }
    return next
  }
  return useSyncExternalStore(provider.subscribe, getSnapshot, getSnapshot)
}

export function usePlayer(): { state: MediaState; actions: PlayerActions } {
  const provider = useProvider()
  const state = useMediaSelector((s) => s)
  return { state, actions: provider.actions }
}

export function usePlayerActions(): PlayerActions {
  // actions is a stable reference on the provider, so we can read it directly
  // without subscribing via useSyncExternalStore (no re-render on state change).
  return useProvider().actions
}
