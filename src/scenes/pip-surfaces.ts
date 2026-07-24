// Parent-origin DOM for document picture-in-picture: the placeholder shown
// inline where the stage was, and the compact controls overlaid on the pip
// window (the main tab's chrome is not visible from there). kino.css is not
// loaded in the pip window, so layout stays inline and every color comes from
// the small token sheet this module injects there; the sheet mirrors the
// chrome tokens in src/styles/kino.css, dark by default with a light block
// keyed on data-kino-theme, exactly like the in-page chrome.

import { formatTime } from "../util/format-time"

export type PipTheme = "light" | "dark"

export type PipOverlayDeps = {
  play(): void
  pause(): void
  getState(): {
    paused: boolean
    activeCueText: string
    currentTime: number
    duration: number
  }
  subscribe(listener: () => void): () => void
}

// Handle on a mounted overlay: the chrome theme can flip while the window
// stays open (the embedding site's theme toggle), so this outlives mount.
export type PipOverlay = {
  setTheme(theme: PipTheme): void
  destroy(): void
}

const theme = (t: PipTheme | undefined): PipTheme =>
  t === "light" ? "light" : "dark"

/**
 * Backdrop for the pip window body. It shows before the mirrored stage paints,
 * so it follows the *stage* theme rather than the chrome theme, and it mirrors
 * --kino-bg in src/styles/kino.css. Opaque in both themes: a transparent body
 * would fall through to the browser's own window chrome.
 */
export function pipStageBackdrop(t: PipTheme): string {
  return theme(t) === "light" ? "oklch(98% 0 0)" : "#000"
}

// Token sheet injected into the pip document. Values mirror the chrome tokens
// in src/styles/kino.css (--kino-control-*, --kino-text-dim, --kino-caption-*,
// --kino-hover, --kino-thumb) so the two chromes read as one player.
const OVERLAY_CSS = `
[data-kino-pip-overlay] {
  --kino-pip-bar: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  --kino-pip-ctrl: #fff;
  --kino-pip-ctrl-dim: rgba(255, 255, 255, 0.65);
  --kino-pip-ctrl-hover: rgba(255, 255, 255, 0.12);
  --kino-pip-cue-fill: rgba(0, 0, 0, 0.6);
  --kino-pip-cue-text: #fff;
  --kino-pip-progress: rgba(255, 255, 255, 0.9);
}
[data-kino-pip-overlay][data-kino-theme="light"] {
  --kino-pip-bar: linear-gradient(transparent, rgba(255, 255, 255, 0.88));
  --kino-pip-ctrl: oklch(24% 0 0);
  --kino-pip-ctrl-dim: rgba(0, 0, 0, 0.55);
  --kino-pip-ctrl-hover: rgba(0, 0, 0, 0.08);
  --kino-pip-cue-fill: rgba(255, 255, 255, 0.72);
  --kino-pip-cue-text: oklch(28% 0 0);
  --kino-pip-progress: rgba(0, 0, 0, 0.62);
}
[data-kino-pip-bar] { background: var(--kino-pip-bar); }
[data-kino-pip-overlay] button { color: var(--kino-pip-ctrl); }
[data-kino-pip-overlay] button:hover { background: var(--kino-pip-ctrl-hover); }
[data-kino-pip-time] { color: var(--kino-pip-ctrl-dim); }
[data-kino-pip-cue] {
  color: var(--kino-pip-cue-text);
  background: var(--kino-pip-cue-fill);
}
[data-kino-pip-progress] { background: var(--kino-pip-progress); }
`

// Exact path data from src/ui/icons.tsx (PlayIcon, PauseIcon, PipIcon) so the
// pip surfaces visually match kino's buttons.
const PLAY_PATH =
  '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor"/>'
const PAUSE_PATH =
  '<rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>'
const PIP_PATH =
  '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor"/>'

function svg(inner: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${inner}</svg>`
}

// mirrors --kino-ease
const EASE = "cubic-bezier(0.22,1,0.36,1)"
const HIDE_DELAY_MS = 2000

export function mountPipPlaceholder(
  container: HTMLElement,
  onReturn: () => void,
): () => void {
  const el = document.createElement("div")
  el.className = "kino-pip-placeholder"
  // The fill covers the whole stage; the card carries the affordance so it
  // reads as a panel in either chrome theme (see kino.css --kino-pip-*).
  const card = document.createElement("div")
  card.className = "kino-pip-placeholder-card"
  card.innerHTML = svg(PIP_PATH, 28)
  const label = document.createElement("div")
  label.textContent = "Playing in picture in picture"
  const sub = document.createElement("div")
  sub.className = "kino-pip-placeholder-sub"
  sub.textContent = "Click to return"
  card.append(label, sub)
  el.appendChild(card)
  el.addEventListener("click", onReturn)
  container.appendChild(el)
  return () => el.remove()
}

export function mountPipOverlay(
  pipWindow: Window,
  deps: PipOverlayDeps,
  chromeTheme?: PipTheme,
): PipOverlay {
  const doc = pipWindow.document

  const root = doc.createElement("div")
  root.setAttribute("data-kino-pip-overlay", "")
  root.setAttribute("data-kino-theme", theme(chromeTheme))
  // pointer-events none on the root; the control bar re-enables clicks.
  root.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif;"

  // Colors and :hover live in the sheet: neither a custom property lookup nor
  // a pseudo-class can be expressed inline, and keeping every color here is
  // what lets a theme flip be one attribute change.
  const style = doc.createElement("style")
  style.setAttribute("data-kino-pip-style", "")
  style.textContent = OVERLAY_CSS
  doc.head.appendChild(style)

  const bar = doc.createElement("div")
  bar.setAttribute("data-kino-pip-bar", "")
  bar.style.cssText =
    "position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 12px;pointer-events:auto;" +
    `transition:opacity 250ms ${EASE};`

  const btn = doc.createElement("button")
  btn.type = "button"
  btn.style.cssText =
    "display:grid;place-items:center;width:34px;height:34px;padding:0;background:none;border:0;" +
    `border-radius:8px;cursor:pointer;transition:background 150ms ${EASE};`

  const time = doc.createElement("div")
  time.setAttribute("data-kino-pip-time", "")
  time.style.cssText =
    "font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;"

  const cue = doc.createElement("div")
  cue.setAttribute("data-kino-pip-cue", "")
  cue.setAttribute("aria-live", "polite")
  // bottom clears the 54px control bar (34px button + 10px vertical padding
  // on each side) with a small gap.
  cue.style.cssText =
    "position:absolute;left:50%;bottom:58px;transform:translateX(-50%);max-width:85%;padding:4px 10px;" +
    "font-size:13px;line-height:1.35;text-align:center;" +
    `border-radius:6px;transition:opacity 250ms ${EASE};`

  // Always-visible playback position along the very bottom edge; updates at
  // the ~10Hz state tick, which is smooth enough without a transition.
  const progress = doc.createElement("div")
  progress.setAttribute("data-kino-pip-progress", "")
  progress.style.cssText =
    "position:absolute;left:0;bottom:0;height:2px;width:0;"

  // Auto-hide: bar + cue stay up while paused; while playing they fade after
  // a stretch without pointer movement over the pip document.
  let hidden = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const applyVisibility = () => {
    const opacity = hidden ? "0" : "1"
    bar.style.opacity = opacity
    cue.style.opacity = opacity
  }
  const clearHideTimer = () => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
  }
  const scheduleHide = () => {
    clearHideTimer()
    hideTimer = setTimeout(() => {
      hideTimer = undefined
      hidden = true
      applyVisibility()
    }, HIDE_DELAY_MS)
  }
  const onPointerMove = () => {
    hidden = false
    applyVisibility()
    if (deps.getState().paused) clearHideTimer()
    else scheduleHide()
  }

  let iconPaused: boolean | undefined
  const render = () => {
    const s = deps.getState()
    if (iconPaused !== s.paused) {
      iconPaused = s.paused
      btn.innerHTML = svg(s.paused ? PLAY_PATH : PAUSE_PATH, 20)
      btn.setAttribute("aria-label", s.paused ? "Play" : "Pause")
    }
    time.textContent = `${formatTime(s.currentTime)} / ${formatTime(s.duration)}`
    progress.style.width =
      s.duration > 0
        ? `${Math.min(100, (s.currentTime / s.duration) * 100)}%`
        : "0%"
    cue.textContent = s.activeCueText
    cue.style.display = s.activeCueText ? "" : "none"
    if (s.paused) {
      clearHideTimer()
      hidden = false
      applyVisibility()
    } else if (!hidden && hideTimer === undefined) {
      scheduleHide()
    }
  }

  btn.addEventListener("click", () => {
    if (deps.getState().paused) deps.play()
    else deps.pause()
  })
  doc.addEventListener("pointermove", onPointerMove)
  const unsubscribe = deps.subscribe(render)
  render()

  bar.append(btn, time)
  root.append(cue, bar, progress)
  doc.body.appendChild(root)
  return {
    setTheme(next) {
      root.setAttribute("data-kino-theme", theme(next))
    },
    destroy() {
      unsubscribe()
      doc.removeEventListener("pointermove", onPointerMove)
      clearHideTimer()
      style.remove()
      root.remove()
    },
  }
}
