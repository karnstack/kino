import { useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import { createScenesProvider, type ScenesProviderOptions } from "./provider"
import type { Provider } from "../core/types"

export type ScenesPlayerProps = ScenesProviderOptions & {
  accentColor?: string
  theme?: Record<string, string>
  className?: string
  /** Blur-up still painted behind the stage until the host is ready. */
  placeholder?: string
  children?: ReactNode
}

/**
 * kino's glass chrome over an audio-driven React scene sequence. The sequence
 * runs in an iframe (the "host page"); pass the host page URL as `src` with
 * any auth token already encoded. Options are read once per `src`; the
 * component remounts internally when `src` changes.
 */
export function ScenesPlayer(props: ScenesPlayerProps) {
  return <ScenesPlayerInner key={props.src} {...props} />
}

function ScenesPlayerInner({
  accentColor,
  theme,
  className,
  placeholder,
  children,
  ...opts
}: ScenesPlayerProps) {
  const providerRef = useRef<Provider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createScenesProvider(opts)
  }
  return (
    <Player
      provider={providerRef.current}
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
