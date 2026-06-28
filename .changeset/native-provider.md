---
"@karnstack/kino": minor
---

Add a native provider for playing raw media URLs. Import `NativePlayer` from
`@karnstack/kino/native` (or `createNativeProvider`) to wrap kino's glass chrome
around a plain `<video>` element playing an mp4/webm/ogg URL directly — no Mux
account or HLS engine involved. Supports posters, sidecar caption tracks,
playback-rate persistence across source swaps, PiP, fullscreen, and OS media
keys. Quality switching hides itself since a raw file has no rendition ladder.
