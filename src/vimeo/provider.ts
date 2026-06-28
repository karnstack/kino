export type VimeoProviderOptions = {
  // A numeric Vimeo id, or any vimeo.com / player.vimeo.com URL —
  // parseVimeoSource resolves it.
  videoId: string
  // Unlisted/private hash. Also parsed from the URL form; an explicit hash here
  // wins over a URL-derived one.
  hash?: string
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}

// Pull the numeric id (and optional unlisted hash) out of any common Vimeo
// reference. A bare id is returned unchanged so callers can pass either.
//   vimeo.com/123                -> { id: "123" }
//   vimeo.com/123/HASH           -> { id: "123", hash: "HASH" }
//   player.vimeo.com/video/123?h=HASH -> { id: "123", hash: "HASH" }
export function parseVimeoSource(input: string): { id: string; hash?: string } {
  const trimmed = input.trim()
  // ?h= query form (player.vimeo.com embeds).
  const q = trimmed.match(/[?&]h=([\w]+)/)
  // /ID or /ID/HASH path form (vimeo.com share links). The id is the first
  // numeric path segment; the hash is the next path segment if present.
  const path = trimmed.match(/(?:^|\/)(\d+)(?:\/([\w]+))?/)
  if (!path) return { id: trimmed }
  const id = path[1]!
  const hash = q?.[1] ?? path[2]
  return hash ? { id, hash } : { id }
}

// The documented SDK embed URL that carries an unlisted hash.
export function playerUrl(id: string, hash: string): string {
  return `https://player.vimeo.com/video/${id}?h=${hash}`
}
