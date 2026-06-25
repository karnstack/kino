import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { createMuxProvider, type MuxProviderOptions } from "./provider"
import type { Provider } from "../core/types"

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
  // Create the provider exactly once so <Player>'s mount effect runs a single
  // time and the underlying <mux-video> element persists across source changes.
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createMuxProvider(opts)
  }
  const provider = providerRef.current

  // Source changes flow through swapSource so the element is reused instead of
  // recreated, preserving DOM and fullscreen continuity. Skip the first run:
  // the initial source is already set when the provider is created.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    provider.swapSource?.({
      playbackId: opts.playbackId,
      poster: opts.poster,
      tokens: opts.tokens,
      metadata: opts.metadata,
    })
  }, [
    opts.playbackId,
    opts.tokens?.playback,
    opts.tokens?.thumbnail,
    opts.tokens?.storyboard,
    opts.poster,
  ])

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
