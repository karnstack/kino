import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import {
  createVimeoProvider,
  parseVimeoSource,
  playerUrl,
  type VimeoProviderOptions,
} from "./provider"
import type { Provider } from "../core/types"

export type VimeoPlayerProps = VimeoProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /** Blur-up still painted behind the video until the first frame loads. */
  placeholder?: string
  children?: ReactNode
}

// Pack id + optional hash into the single `src` string swapSource consumes.
const packSrc = (videoId: string, hash?: string) => {
  const parsed = parseVimeoSource(videoId)
  const h = hash ?? parsed.hash
  return h ? playerUrl(parsed.id, h) : parsed.id
}

/**
 * kino's glass chrome over a Vimeo video, backed by the Vimeo Player SDK. Pass a
 * numeric id or any vimeo.com / player.vimeo.com URL; for unlisted videos pass
 * the `hash` (or a share URL that already contains it).
 *
 * Only `videoId`, `hash`, and `metadata.videoTitle` are reactive (they flow
 * through `swapSource`). `autoPlay`, `muted`, `loop`, and `defaultRate` are read
 * once at creation — remount (e.g. via `key`) to change them.
 *
 * Chromeless playback (kino owning the controls) requires a **paid** Vimeo plan;
 * on a free-account video Vimeo renders its own controls under kino's overlay.
 *
 * Per Vimeo's embed terms, kino does not obscure the player — no poster-on-pause
 * cover over the embed; kino's controls sit alongside Vimeo's surface.
 */
export function VimeoPlayer({
  accentColor,
  theme,
  className,
  placeholder,
  children,
  ...opts
}: VimeoPlayerProps) {
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createVimeoProvider(opts)
  }
  const provider = providerRef.current

  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    provider.swapSource?.({
      src: packSrc(opts.videoId, opts.hash),
      metadata: opts.metadata,
    })
  }, [opts.videoId, opts.hash, opts.metadata?.videoTitle])

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
