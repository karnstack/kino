import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import {
  createScenesProvider,
  type ScenesProvider,
  type ScenesProviderOptions,
} from "./provider"

export type ScenesPlayerProps = Omit<ScenesProviderOptions, "theme"> & {
  accentColor?: string
  theme?: Record<string, string>
  /**
   * Stage theme inside the host document; defaults to dark. The initial
   * value seeds the host, later values flip it live without a remount.
   * Distinct from `theme`, which styles kino's chrome.
   */
  sceneTheme?: "light" | "dark"
  className?: string
  /** Blur-up still painted behind the stage until the host is ready. */
  placeholder?: string
  children?: ReactNode
}

/**
 * kino's glass chrome over an audio-driven React scene sequence. The sequence
 * runs in an iframe (the "host page"); pass the host page URL as `src` with
 * any auth token already encoded. Options are read once per `src`; the
 * component remounts internally when `src` changes. `sceneTheme` is the one
 * exception: later values ride the wire to the live host.
 */
export function ScenesPlayer(props: ScenesPlayerProps) {
  return <ScenesPlayerInner key={props.src} {...props} />
}

function ScenesPlayerInner({
  accentColor,
  theme,
  sceneTheme,
  className,
  placeholder,
  children,
  ...opts
}: ScenesPlayerProps) {
  const providerRef = useRef<ScenesProvider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createScenesProvider({ ...opts, theme: sceneTheme })
  }
  // The initial value already rode the provider options; the extra mount-time
  // setSceneTheme is idempotent, and later values flip the host live.
  useEffect(() => {
    if (sceneTheme != null) providerRef.current?.setSceneTheme(sceneTheme)
  }, [sceneTheme])
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
