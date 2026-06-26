import { useEffect, useRef, useState, type ReactNode } from "react"
import { useWrapperRef } from "./player"
import { renderShortcut, type TipAlign } from "./tooltip"

export function Popover({
  trigger,
  shortcut,
  label,
  openOn,
  align = "center",
  children,
}: {
  trigger: ReactNode
  shortcut?: ReactNode
  label: string
  openOn?: string
  align?: TipAlign
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // After selecting an item the menu closes while the pointer is still over the
  // trigger — suppress the hover tooltip until the pointer actually leaves.
  const [justClosed, setJustClosed] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useWrapperRef()

  useEffect(() => {
    if (!openOn) return
    const wrapper = wrapperRef?.current
    if (!wrapper) return
    const handler = () => setOpen(true)
    wrapper.addEventListener(openOn, handler)
    return () => wrapper.removeEventListener(openOn, handler)
  }, [openOn, wrapperRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  return (
    <div
      className="kino-popover-root"
      ref={rootRef}
      onPointerLeave={() => setJustClosed(false)}
    >
      <button
        className="kino-ctrl"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {!open && !justClosed && (
        <span
          className={`kino-tip kino-glass kino-tip-${align}`}
          aria-hidden="true"
        >
          {label}
          {renderShortcut(shortcut)}
        </span>
      )}
      {open && (
        <div
          className={`kino-menu kino-glass kino-menu-${align}`}
          role="menu"
          onClick={() => {
            setOpen(false)
            setJustClosed(true)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
