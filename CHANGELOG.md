# @karnstack/kino

## 0.6.0

### Minor Changes

- 585dcec: Scenes storyboard passthrough: `ScenesProviderOptions` (and therefore
  `ScenesPlayer`) accept `storyboard: { vttUrl }`, surfacing
  `capabilities.hasStoryboard` and `state.storyboard` so the scrubber shows
  thumbnail previews on hover, exactly as it does for Mux sources. The VTT's
  cues point into a sprite image via `#xywh` fragments (the same format the Mux
  storyboard track uses). `SceneManifest` gains an optional `storyboard` field
  recording where that VTT lives.

## 0.5.0

### Minor Changes

- 2e51a9d: Add a scenes entry (`@karnstack/kino/scenes`): audio-driven React scene sequences.
  On the parent side, `createScenesProvider` and `ScenesPlayer` run scene iframes
  under kino's chrome; inside the iframe, `createSceneHost` and `useSceneTimeline`
  sync visuals to the audio clock over a postMessage wire protocol. Captions ship
  as sidecar VTT.

## 0.4.0

### Minor Changes

- 4e01744: Add a Vimeo provider (`@karnstack/kino/vimeo`) — the Vimeo Player SDK under
  kino's chrome with quality selection, styled captions, and playback rate.
  Supports unlisted videos via a `hash`. Import `VimeoPlayer` or the lower-level
  `createVimeoProvider`.

## 0.3.0

### Minor Changes

- c26bbe9: feat: YouTube provider. A new `@karnstack/kino/youtube` entry puts the same kino
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

## 0.2.0

### Minor Changes

- fe7a833: Add a native provider for playing raw media URLs. Import `NativePlayer` from
  `@karnstack/kino/native` (or `createNativeProvider`) to wrap kino's glass chrome
  around a plain `<video>` element playing an mp4/webm/ogg URL directly — no Mux
  account or HLS engine involved. Supports posters, sidecar caption tracks,
  playback-rate persistence across source swaps, PiP, fullscreen, and OS media
  keys. Quality switching hides itself since a raw file has no rendition ladder.

## 0.1.3

### Patch Changes

- 34aa813: Fix scrubber seek hit area. The hover preview rendered across the full scrubber height (its `8px` vertical padding), but `pointerdown`/seek was bound only to the thin `.kino-track` line (4–6px). Clicking anywhere the preview showed — but off the line — did nothing. Seek now binds to the whole scrubber, so clicking anywhere the preview appears seeks. Time mapping still derives from the track rect (padding is vertical only, so the horizontal extent is unchanged).

## 0.1.2

### Patch Changes

- fcc6f05: Actually fix playback-rate persistence across source swaps. The previous attempt set `defaultPlaybackRate`, but mux-video does not proxy that property to its inner `<video>`, so loading a new source still reset the rate to 1x. kino now tracks the chosen rate (`desiredRate`) and re-asserts it on the element after every source load, and reports it as `state.rate` so the brief reset never surfaces to the UI.

## 0.1.1

### Patch Changes

- 66adef3: Add a `placeholder` prop (blur-up): pass a low-res data URI or URL and kino paints it behind the video while the poster and first frame load, then the sharp poster covers it. Works on `MuxPlayer` and the headless `Player`.

  Fix playback-rate persistence across source swaps. Loading a new source resets the media element's `playbackRate` to `defaultPlaybackRate`, so the chosen speed dropped to 1x on every `swapSource`. kino now keeps `defaultPlaybackRate` in lockstep with the rate (seeded at mount, updated in `setRate`), so the rate survives lesson/source changes.

## 0.1.0

### Minor Changes

- f61106c: Initial public release of kino — a themeable React video player with pluggable providers. Includes the Mux provider entry point (`@karnstack/kino/mux`), HLS playback, custom controls, and bundled styles (`@karnstack/kino/styles.css`).
