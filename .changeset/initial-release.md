---
"@karnstack/kino": patch
---

Initial release of kino, a premium themeable React video player with a pluggable-provider architecture.

- Translucent glass / macOS-style player chrome: idle play overlay with speed pre-select, auto-hiding control bar, scrubber with buffered shading, drag-to-seek, and storyboard thumbnail previews.
- Speed, quality, and captions menus that gate themselves on provider and platform capabilities.
- Keyboard-first controls (play/pause, seek, volume, rate, mute, captions, fullscreen, and percent seek) that yield to focused text inputs.
- Themeable via the `accentColor` prop and `--kino-*` CSS custom properties.
- Mux provider built on the `@mux/mux-video` element, plus a `MuxPlayer` drop-in that accepts signed playback, thumbnail, and storyboard tokens (auth-agnostic; tokens are minted server-side).
- Headless `Player` root, store, and control primitives exported for custom chrome.
- React 19 peer dependency. Entry points: `@karnstack/kino`, `@karnstack/kino/mux`, and `@karnstack/kino/styles.css`.
