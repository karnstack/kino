# @karnstack/kino

## 0.1.1

### Patch Changes

- 66adef3: Add a `placeholder` prop (blur-up): pass a low-res data URI or URL and kino paints it behind the video while the poster and first frame load, then the sharp poster covers it. Works on `MuxPlayer` and the headless `Player`.

  Fix playback-rate persistence across source swaps. Loading a new source resets the media element's `playbackRate` to `defaultPlaybackRate`, so the chosen speed dropped to 1x on every `swapSource`. kino now keeps `defaultPlaybackRate` in lockstep with the rate (seeded at mount, updated in `setRate`), so the rate survives lesson/source changes.

## 0.1.0

### Minor Changes

- f61106c: Initial public release of kino — a themeable React video player with pluggable providers. Includes the Mux provider entry point (`@karnstack/kino/mux`), HLS playback, custom controls, and bundled styles (`@karnstack/kino/styles.css`).
