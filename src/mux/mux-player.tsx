import { useMemo, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { createMuxProvider, type MuxProviderOptions } from "./provider"

export type MuxPlayerProps = MuxProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  children?: ReactNode
}

export function MuxPlayer({
  accentColor,
  theme,
  className,
  children,
  ...opts
}: MuxPlayerProps) {
  // Recreate the provider only when the identity of the media changes.
  // Deps are intentionally limited to the media identity so the provider (and
  // its underlying element) is recreated only when the source changes, not on
  // every accent/theme/className update.
  const provider = useMemo(
    () => createMuxProvider(opts),
    [opts.playbackId, opts.tokens?.playback]
  )
  return (
    <Player
      provider={provider}
      accentColor={accentColor}
      theme={theme}
      className={className}
    >
      <IdleOverlay />
      <ControlBar />
      {children}
    </Player>
  )
}
