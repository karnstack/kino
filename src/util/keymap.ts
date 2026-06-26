export type KeyAction =
  | { type: "toggle-play" }
  | { type: "seek-by"; delta: number }
  | { type: "volume-by"; delta: number }
  | { type: "toggle-fullscreen" }
  | { type: "toggle-mute" }
  | { type: "toggle-captions" }
  | { type: "open-speed" }
  | { type: "rate-by"; delta: number }
  | { type: "seek-percent"; percent: number }

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  )
}

export function resolveKey(e: KeyboardEvent): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case " ":
    case "k":
    case "MediaPlayPause":
    case "MediaPlay":
    case "MediaPause":
      return { type: "toggle-play" }
    case "ArrowRight":
      return { type: "seek-by", delta: 5 }
    case "ArrowLeft":
      return { type: "seek-by", delta: -5 }
    case "ArrowUp":
      return { type: "volume-by", delta: 0.1 }
    case "ArrowDown":
      return { type: "volume-by", delta: -0.1 }
    case "f":
      return { type: "toggle-fullscreen" }
    case "m":
      return { type: "toggle-mute" }
    case "c":
      return { type: "toggle-captions" }
    case "s":
      return { type: "open-speed" }
    case "<":
      return { type: "rate-by", delta: -0.25 }
    case ">":
      return { type: "rate-by", delta: 0.25 }
  }
  if (/^[0-9]$/.test(e.key))
    return { type: "seek-percent", percent: Number(e.key) * 10 }
  return null
}
