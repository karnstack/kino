import { createContext, useContext } from "react"
import type { Marker } from "../core/types"

export type MarkersValue = {
  markers: readonly Marker[]
  onMarkerClick?: (id: string) => void
}

export const MarkersContext = createContext<MarkersValue>({ markers: [] })

export function useMarkers(): MarkersValue {
  return useContext(MarkersContext)
}

// Only markers the scrubber can place: a finite time inside [0, duration].
export function visibleMarkers(
  markers: readonly Marker[],
  duration: number,
): Marker[] {
  if (!(duration > 0)) return []
  return markers.filter(
    (m) => Number.isFinite(m.time) && m.time >= 0 && m.time <= duration,
  )
}
