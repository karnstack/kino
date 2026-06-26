export type Tile = {
  url: string
  x: number
  y: number
  w: number
  h: number
  start: number
  end: number
}
export type Storyboard = {
  tiles: Tile[]
  thumbnailAt(time: number): Tile | null
}

function toSeconds(stamp: string): number {
  // hh:mm:ss.mmm or mm:ss.mmm
  const parts = stamp.trim().split(":").map(Number)
  let s = 0
  for (const p of parts) s = s * 60 + p
  return s
}

export function parseStoryboard(vttText: string, baseUrl: string): Storyboard {
  const lines = vttText.split(/\r?\n/)
  const tiles: Tile[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.includes("-->")) continue
    const [from, to] = line.split("-->")
    if (from === undefined || to === undefined) continue
    const start = toSeconds(from)
    const end = toSeconds(to)
    const payload = (lines[i + 1] ?? "").trim()
    const m = payload.match(/^(.*?)#xywh=(\d+),(\d+),(\d+),(\d+)/)
    if (!m) continue
    const [, file, x, y, w, h] = m
    if (
      file === undefined ||
      x === undefined ||
      y === undefined ||
      w === undefined ||
      h === undefined
    )
      continue
    tiles.push({
      url: new URL(file, baseUrl).href,
      x: +x,
      y: +y,
      w: +w,
      h: +h,
      start,
      end,
    })
  }
  return {
    tiles,
    thumbnailAt(time: number) {
      if (tiles.length === 0) return null
      for (const t of tiles) if (time >= t.start && time < t.end) return t
      return tiles[tiles.length - 1] ?? null
    },
  }
}
