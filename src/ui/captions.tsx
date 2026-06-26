import { useMediaSelector } from "../core/store"
import { useControlsVisible } from "./player"

// Custom caption overlay. The provider keeps the native text track in "hidden"
// mode (cues active but not browser-rendered) and mirrors the current cue into
// state.activeCueText, so we draw it ourselves in a styled glass box. When the
// control bar is up we lift the box clear of it, and let it settle back down
// as the controls fade.
export function Captions() {
  const text = useMediaSelector((s) => s.activeCueText)
  const controlsVisible = useControlsVisible()
  if (!text) return null
  return (
    <div
      className={`kino-captions ${controlsVisible ? "is-raised" : ""}`}
      aria-live="polite"
    >
      <span className="kino-caption-text">{text}</span>
    </div>
  )
}
