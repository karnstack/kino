# @karnstack/kino

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
