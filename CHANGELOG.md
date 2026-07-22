# @karnstack/kino

## 0.8.0

### Minor Changes

- d53f4f4: Scenes: light/dark stage theming over the wire. kino:init gains an optional
  theme and a new kino:setTheme command follows the embedding site's live theme
  toggle without reloading the iframe. ScenesPlayer takes sceneTheme (distinct
  from theme, which styles kino's chrome), createScenesProvider takes theme and
  returns ScenesProvider with setSceneTheme, and the host applies the theme to
  documentElement as exactly one of dark/light plus the matching colorScheme.
  The pip mirror inits with the current theme and follows flips alongside the
  master. Dark stays canonical: omit everything and existing hosts behave
  exactly as before.

## 0.7.1

### Patch Changes

- f282bf2: Scenes: fix the visible flash on every scene transition in Safari. WebKit
  presents a freshly created compositing layer before its content paints (WebKit
  bug 270330), so the keyed remount at each boundary flashed. Two changes address
  it: the never-unmounting stage div now pins a persistent compositing layer
  (translateZ(0) plus willChange, backfaceVisibility, and isolation) so child
  scene swaps paint into an already-promoted backing store instead of triggering
  first-show layer creation; and on a natural advance the outgoing scene is held
  over the incoming one for 240ms so its settled final frame covers any
  not-yet-painted first frame. The held scene is reordered rather than remounted,
  so its kino:scenechange still fires exactly once, and the hold is skipped on far
  seeks, scrubs, and when playback pauses.

## 0.7.0

### Minor Changes

- ad29d1f: Scenes: document picture-in-picture (Chromium desktop, capability-gated via canPiP) and a pseudo-fullscreen fallback for browsers without Element.requestFullscreen (iPhone Safari and Chrome). kino:init gains an optional startTime, used to start the muted pip mirror at the master clock so playback continues seamlessly without interrupting the main tab; the host also accepts commands from the pip window's opener, and the scene host's clock element is now a hidden video element (observable to createSceneHost embedders who style or select audio in host pages).

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
