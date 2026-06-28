// iPhone/iPad/iPod own adaptive playback and use native fullscreen for the
// underlying <video>, so providers branch on this for capability gating.
//
// iPadOS 13+ defaults to a desktop-class "Macintosh" UA, so the classic regex
// misses iPad entirely. A real Mac reports maxTouchPoints 0; an iPad reports 5,
// so a Macintosh UA with touch points is an iPad in desktop mode. Pass
// navigator.maxTouchPoints (defaults to 0, keeping the UA-only behavior).
export function detectIOS(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && maxTouchPoints > 1
}
