# @karnstack/kino

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
