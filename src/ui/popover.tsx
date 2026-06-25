import { useState, type ReactNode } from "react"

export function Popover({
  trigger,
  shortcut,
  label,
  children,
}: {
  trigger: ReactNode
  shortcut?: string
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="kino-popover-root" onPointerLeave={() => setOpen(false)}>
      <button
        className="kino-ctrl"
        aria-label={label}
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
