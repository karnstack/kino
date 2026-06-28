// iPhone/iPad/iPod own adaptive playback and use native fullscreen for the
// underlying <video>, so providers branch on this for capability gating.
export function detectIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/.test(ua)
}
