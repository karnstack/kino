import { useEffect, useRef, type ReactNode } from "react"
import { Player } from "../ui/player"
import { ControlBar } from "../ui/control-bar"
import { IdleOverlay } from "../ui/idle-overlay"
import { Captions } from "../ui/captions"
import type { Marker } from "../core/types"
import {
  createScenesProvider,
  type ScenesProvider,
  type ScenesProviderOptions,
} from "./provider"

export type ScenesPlayerProps = Omit<
  ScenesProviderOptions,
  "theme" | "chromeTheme"
> & {
  accentColor?: string
  /** Points to draw on the timeline. Omit and nothing changes. */
  markers?: Marker[]
  /** Called with a marker's id when it is clicked. A click on a marker does not seek. */
  onMarkerClick?: (id: string) => void
  theme?: Record<string, string>
  /**
   * Chrome theme; defaults to dark. Stamped as `data-kino-theme` on the
   * `.kino` root, and carried into the picture-in-picture window, whose
   * controls kino draws itself. Later values flip both without a remount.
   * Distinct from `sceneTheme`, which themes the iframe stage.
   */
  chromeTheme?: "light" | "dark"
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
  chromeTheme,
  sceneTheme,
  className,
  placeholder,
  markers,
  onMarkerClick,
  children,
  ...opts
}: ScenesPlayerProps) {
  const providerRef = useRef<ScenesProvider | null>(null)
  if (providerRef.current === null) {
    providerRef.current = createScenesProvider({
      ...opts,
      theme: sceneTheme,
      chromeTheme,
    })
  }
  // The initial values already rode the provider options; the extra mount-time
  // setters are idempotent, and later values flip the host and any open pip
  // window live.
  useEffect(() => {
    if (sceneTheme != null) providerRef.current?.setSceneTheme(sceneTheme)
  }, [sceneTheme])
  useEffect(() => {
    if (chromeTheme != null) providerRef.current?.setChromeTheme(chromeTheme)
  }, [chromeTheme])
  return (
    <Player
      provider={providerRef.current}
      accentColor={accentColor}
      theme={theme}
      chromeTheme={chromeTheme}
      className={className}
      placeholder={placeholder}
      markers={markers}
      onMarkerClick={onMarkerClick}
    >
      <IdleOverlay />
      <Captions />
      <ControlBar />
      {children}
    </Player>
  )
}
