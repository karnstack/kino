import { useEffect, useRef, useState, type ReactNode } from "react"
import { useWrapperRef } from "./player"

export function Popover({
  trigger,
  shortcut,
  label,
  openOn,
  children,
}: {
  trigger: ReactNode
  shortcut?: string
  label: string
  openOn?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
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
      onPointerLeave={() => setOpen(false)}
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
      {!open && shortcut && (
        <span className="kino-tip kino-glass">
          {label}
          <kbd>{shortcut}</kbd>
        </span>
      )}
      {open && (
        <div className="kino-menu kino-glass" role="menu">
          {children}
        </div>
      )}
    </div>
  )
}
