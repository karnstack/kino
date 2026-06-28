---
"@karnstack/kino": minor
---

feat: YouTube provider. A new `@karnstack/kino/youtube` entry puts the same kino
glass chrome over the YouTube IFrame Player API. `<YouTubePlayer videoId="…" />`
accepts a bare id or any watch / youtu.be / embed / shorts URL (resolved via the
exported `parseYouTubeId` helper).

Play/pause, seek, speed, fullscreen, volume, and a captions menu (driven by the
video's own subtitle tracks, rendered by YouTube inside the embed) all work
through kino's controls. The provider follows YouTube's API terms — it plays
through the official IFrame API and doesn't obscure the player, so YouTube's own
thumbnail, play button, title, and logo show before playback and while paused.
Quality, picture-in-picture, and scrub-preview storyboards are hidden because
the IFrame API doesn't expose them. No runtime dependency — the API is loaded on
demand.
