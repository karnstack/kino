import { createContext, useContext, useSyncExternalStore } from "react"
import { createSceneClock, type Cues, type SceneClock } from "./cues"

export type TimelineContextValue = {
  cues: Cues
  duration: number
  getTime: () => number
  subscribe: (fn: () => void) => () => void
}

export const TimelineContext = createContext<TimelineContextValue | null>(null)

function useTimelineContext(): TimelineContextValue {
  const ctx = useContext(TimelineContext)
  if (!ctx) throw new Error("useSceneTimeline used outside a scene host")
  return ctx
}

export function useSceneTime(): number {
  const s = useTimelineContext()
  return useSyncExternalStore(s.subscribe, s.getTime, s.getTime)
}

export function useSceneTimeline(): SceneClock {
  const s = useTimelineContext()
  const t = useSceneTime()
  return createSceneClock(s.cues, s.duration, t)
}
