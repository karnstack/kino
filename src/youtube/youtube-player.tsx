import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import { createYouTubeProvider, type YouTubeProviderOptions } from "./provider"
import type { Provider } from "../core/types"

export type YouTubePlayerProps = YouTubeProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /** Blur-up still painted behind the video until the first frame loads. */
  placeholder?: string
  children?: ReactNode
}

/**
 * kino's glass chrome over a YouTube video, backed by the YouTube IFrame Player
 * API. Pass a video id or any watch / youtu.be / embed / shorts URL.
 *
 * Only `videoId` and `metadata.videoTitle` are reactive (they flow through
 * `swapSource`). `autoPlay`, `muted`, `loop`, and `defaultRate` are read once
 * when the provider is created — changing them later is a no-op. Remount (e.g.
 * via `key`) if you need them to change.
 *
 * The IFrame API can't expose quality or picture-in-picture, so those controls
 * hide themselves automatically. Captions work through the API and are rendered
 * by YouTube inside the embed.
 *
 * Per YouTube's API terms, kino doesn't obscure the player: YouTube shows its
 * own thumbnail, play button, title, and logo before playback and while paused.
 * kino's controls sit alongside them.
 */
export function YouTubePlayer({
  accentColor,
  theme,
  className,
  placeholder,
  children,
  ...opts
}: YouTubePlayerProps) {
  // Create the provider exactly once so <Player>'s mount effect runs a single
  // time and the underlying iframe persists across source changes.
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createYouTubeProvider(opts)
  }
  const provider = providerRef.current

  // Source changes flow through swapSource so the iframe is reused instead of
  // recreated, preserving DOM and fullscreen continuity. Skip the first run:
  // the initial source is already set when the provider is created.
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    provider.swapSource?.({
      src: opts.videoId,
      metadata: opts.metadata,
    })
    // Depend on the primitive title (not the metadata object) so a title-only
    // change refreshes the OS media session without re-swapping every render.
  }, [opts.videoId, opts.metadata?.videoTitle])

  return (
    <Player
      provider={provider}
      accentColor={accentColor}
      theme={theme}
      className={className}
      placeholder={placeholder}
    >
      <IdleOverlay />
      <Captions />
      <ControlBar />
      {children}
    </Player>
  )
}
