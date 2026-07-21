// Parent-origin DOM for document picture-in-picture: the placeholder shown
// inline where the stage was, and the minimal controls overlaid on the pip
// window (the main tab's chrome is not visible from there). The overlay uses
// inline styles because kino.css is not loaded in the pip window; copying
// stylesheets across is not worth it for two elements.

export type PipOverlayDeps = {
  play(): void
  pause(): void
  getState(): { paused: boolean; activeCueText: string }
  subscribe(listener: () => void): () => void
}

export function mountPipPlaceholder(
  container: HTMLElement,
  onReturn: () => void,
): () => void {
  const el = document.createElement("div")
  el.className = "kino-pip-placeholder"
  el.textContent = "Playing in picture in picture"
  el.addEventListener("click", onReturn)
  container.appendChild(el)
  return () => el.remove()
}

export function mountPipOverlay(
  pipWindow: Window,
  deps: PipOverlayDeps,
): () => void {
  const doc = pipWindow.document
  const bar = doc.createElement("div")
  bar.setAttribute("data-kino-pip-overlay", "")
  bar.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;padding:12px;background:linear-gradient(transparent,rgba(0,0,0,.7));font-family:system-ui,sans-serif;"
  const btn = doc.createElement("button")
  btn.type = "button"
  btn.style.cssText =
    "background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px;"
  const cue = doc.createElement("div")
  cue.setAttribute("aria-live", "polite")
  cue.style.cssText =
    "color:#fff;font-size:13px;line-height:1.3;flex:1;text-shadow:0 1px 2px rgba(0,0,0,.8);"
  const render = () => {
    const s = deps.getState()
    // U+FE0E keeps the glyphs in text presentation instead of emoji.
    btn.textContent = s.paused ? "▶︎" : "⏸︎"
    btn.setAttribute("aria-label", s.paused ? "Play" : "Pause")
    cue.textContent = s.activeCueText
  }
  btn.addEventListener("click", () => {
    if (deps.getState().paused) deps.play()
    else deps.pause()
  })
  const unsubscribe = deps.subscribe(render)
  render()
  bar.append(btn, cue)
  doc.body.appendChild(bar)
  return () => {
    unsubscribe()
    bar.remove()
  }
}
