import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import { createNativeProvider, type NativeProviderOptions } from "./provider"
import type { Provider } from "../core/types"

export type NativePlayerProps = NativeProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /** Blur-up still painted behind the video until the poster/first frame loads. */
  placeholder?: string
  children?: ReactNode
}

/**
 * kino's glass chrome over a plain HTML <video> element, playing a raw media
 * URL (mp4, webm, ogg, …) directly. Use this when you have a file URL rather
 * than a Mux playback id.
 *
 * Only `src`, `poster`, and `metadata.videoTitle` are reactive (they flow
 * through `swapSource`). `tracks`, `crossOrigin`, `muted`, `loop`, and
 * `defaultRate` are read once when the provider is created — changing them later
 * is a no-op. Remount (e.g. via `key`) if you need them to change.
 */
export function NativePlayer({
  accentColor,
  theme,
  className,
  placeholder,
  children,
  ...opts
}: NativePlayerProps) {
  // Create the provider exactly once so <Player>'s mount effect runs a single
  // time and the underlying <video> element persists across source changes.
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createNativeProvider(opts)
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
      src: opts.src,
      poster: opts.poster,
      metadata: opts.metadata,
    })
    // Depend on the primitive title (not the metadata object) so a title-only
    // change refreshes the OS media session without re-swapping every render.
  }, [opts.src, opts.poster, opts.metadata?.videoTitle])

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
