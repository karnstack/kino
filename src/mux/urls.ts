const IMAGE_HOST = "https://image.mux.com"

export function buildImageUrl(
  playbackId: string,
  kind: "storyboard" | "thumbnail",
  token?: string,
  ext = kind === "storyboard" ? "vtt" : "webp",
): string {
  const base = `${IMAGE_HOST}/${playbackId}/${kind}.${ext}`
  return token ? `${base}?token=${token}` : base
}

export function detectIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/.test(ua)
}
