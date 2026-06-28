// Test-only stand-in for the Vimeo Player SDK. jsdom has no SDK, so tests
// install this on window.Vimeo. Methods record their calls and return resolved
// promises; tests drive state by calling emit(event, payload). Imported ONLY by
// the vitest specs, so it never enters a tsdown build-entry graph.
type Handler = (data?: unknown) => void

export class FakeVimeoPlayer {
  static instances: FakeVimeoPlayer[] = []
  el: HTMLElement
  opts: Record<string, unknown>
  calls: Array<[string, unknown]> = []
  private handlers: Record<string, Set<Handler>> = {}
  _duration = 0
  _qualities: Array<{ id: string; label: string; active: boolean }> = []
  _textTracks: Array<{
    label: string
    language: string
    kind: string
    mode: string
  }> = []
  _muted = false

  constructor(el: HTMLElement, opts: Record<string, unknown>) {
    this.el = el
    this.opts = opts
    FakeVimeoPlayer.instances.push(this)
    // The SDK injects an iframe; mirror the real default allow list (which omits
    // picture-in-picture) so tests exercise the provider's PiP allow patch.
    const iframe = document.createElement("iframe")
    iframe.setAttribute("allow", "autoplay; encrypted-media")
    el.appendChild(iframe)
  }

  on(event: string, fn: Handler) {
    ;(this.handlers[event] ??= new Set()).add(fn)
  }
  off(event: string, fn?: Handler) {
    if (fn) this.handlers[event]?.delete(fn)
    else delete this.handlers[event]
  }
  emit(event: string, data?: unknown) {
    this.handlers[event]?.forEach((fn) => fn(data))
  }

  ready() {
    return Promise.resolve()
  }
  play() {
    this.calls.push(["play", undefined])
    return Promise.resolve()
  }
  pause() {
    this.calls.push(["pause", undefined])
    return Promise.resolve()
  }
  setCurrentTime(t: number) {
    this.calls.push(["setCurrentTime", t])
    return Promise.resolve(t)
  }
  getDuration() {
    return Promise.resolve(this._duration)
  }
  getVolume() {
    return Promise.resolve(1)
  }
  setVolume(v: number) {
    this.calls.push(["setVolume", v])
    return Promise.resolve(v)
  }
  getMuted() {
    return Promise.resolve(this._muted)
  }
  setMuted(m: boolean) {
    this.calls.push(["setMuted", m])
    return Promise.resolve(m)
  }
  setPlaybackRate(r: number) {
    this.calls.push(["setPlaybackRate", r])
    return Promise.resolve(r)
  }
  getQualities() {
    return Promise.resolve(this._qualities)
  }
  setQuality(id: string) {
    this.calls.push(["setQuality", id])
    return Promise.resolve(id)
  }
  getTextTracks() {
    return Promise.resolve(this._textTracks)
  }
  enableTextTrack(language: string, kind?: string, showing?: boolean) {
    this.calls.push(["enableTextTrack", [language, kind, showing]])
    return Promise.resolve({ language, kind })
  }
  disableTextTrack() {
    this.calls.push(["disableTextTrack", undefined])
    return Promise.resolve()
  }
  requestPictureInPicture() {
    this.calls.push(["requestPictureInPicture", undefined])
    return Promise.resolve()
  }
  exitPictureInPicture() {
    this.calls.push(["exitPictureInPicture", undefined])
    return Promise.resolve()
  }
  loadVideo(idOrObj: unknown) {
    this.calls.push(["loadVideo", idOrObj])
    return Promise.resolve(idOrObj)
  }
  destroy() {
    this.calls.push(["destroy", undefined])
    return Promise.resolve()
  }
}

export function installFakeVimeo() {
  FakeVimeoPlayer.instances = []
  ;(window as unknown as { Vimeo?: unknown }).Vimeo = { Player: FakeVimeoPlayer }
}

export function uninstallFakeVimeo() {
  delete (window as unknown as { Vimeo?: unknown }).Vimeo
  FakeVimeoPlayer.instances = []
}

// Flush pending microtasks (the provider's async reads at mount/loaded).
export function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}
