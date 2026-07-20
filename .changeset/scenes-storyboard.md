---
"@karnstack/kino": minor
---

Scenes storyboard passthrough: `ScenesProviderOptions` (and therefore
`ScenesPlayer`) accept `storyboard: { vttUrl }`, surfacing
`capabilities.hasStoryboard` and `state.storyboard` so the scrubber shows
thumbnail previews on hover, exactly as it does for Mux sources. The VTT's
cues point into a sprite image via `#xywh` fragments (the same format the Mux
storyboard track uses). `SceneManifest` gains an optional `storyboard` field
recording where that VTT lives.
