import type { ReactNode } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "./icons"

export type TipAlign = "start" | "center" | "end"

// String shortcuts get a <kbd> chip; node shortcuts (e.g. <SpaceKey/>) render
// as-is so they can bring their own styling.
export function renderShortcut(shortcut?: ReactNode) {
  if (shortcut == null) return null
  return typeof shortcut === "string" ? <kbd>{shortcut}</kbd> : shortcut
}

// A wide spacebar keycap that gently presses on a loop while it's on screen.
export function SpaceKey() {
  return (
    <span className="kino-key kino-key-space" aria-hidden="true">
      <span className="kino-key-space-bar" />
    </span>
  )
}

// Square arrow keycap with the same self-pressing animation.
export function ArrowKey({ dir }: { dir: "left" | "right" }) {
  return (
    <span className="kino-key kino-key-arrow" aria-hidden="true">
      {dir === "left" ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </span>
  )
}

// Hover label + optional keyboard shortcut, same look as the menu tooltips.
// Reuses .kino-popover-root so the existing :hover .kino-tip CSS applies.
export function Tooltip({
  label,
  shortcut,
  align = "center",
  children,
}: {
  label: string
  shortcut?: ReactNode
  align?: TipAlign
  children: ReactNode
}) {
  return (
    <span className="kino-popover-root">
      {children}
      <span className={`kino-tip kino-glass kino-tip-${align}`} aria-hidden="true">
        {label}
        {renderShortcut(shortcut)}
      </span>
    </span>
  )
}
