# @karnstack/kino

A premium, themeable React video player with a pluggable-provider architecture. Translucent, frosted-glass chrome, keyboard-first controls, and a small typed surface. Mux is the first provider.

kino ships the player UI and a provider contract. Each provider adapts a streaming engine to that contract, so the same glass chrome can sit on top of different backends. The Mux provider is built on the `@mux/mux-video` custom element.

## Install

```sh
pnpm add @karnstack/kino
```

The Mux engine (`@mux/mux-video`) is pulled in transitively, so you do not install it yourself. React 19 is a peer dependency (`react` and `react-dom` `>=19`).

## Quick start

```tsx
import { MuxPlayer } from "@karnstack/kino/mux"
import "@karnstack/kino/styles.css"

export function Clip() {
  return (
    <MuxPlayer
      playbackId="your-playback-id"
      tokens={{ playback, thumbnail, storyboard }}
      accentColor="oklch(50.8% 0.118 165.612)"
    />
  )
}
```

Give the player a sized container. It fills `100%` width and height of its parent, so wrap it in an element with the aspect ratio or dimensions you want.

### Tokens are passed in

kino is auth-agnostic. For signed playback you mint the `playback`, `thumbnail`, and `storyboard` tokens server-side and hand them to the player through the `tokens` prop. The player never holds a signing key and never talks to your auth layer; it only appends the tokens you give it to the media, thumbnail, and storyboard URLs. For public playback you can omit `tokens` entirely.

## Theming

The quickest knob is the `accentColor` prop, which drives the scrubber fill, active menu items, and range controls.

```tsx
<MuxPlayer playbackId="..." accentColor="oklch(50.8% 0.118 165.612)" />
```

For deeper control, every visual is driven by CSS custom properties on the `.kino` root. Override them in your own stylesheet, or pass a `theme` object of property/value pairs to set them inline.

| Custom property         | Default                                       | Role                                          |
| ----------------------- | --------------------------------------------- | --------------------------------------------- |
| `--kino-accent`         | `oklch(50.8% 0.118 165.612)`                  | Accent color (progress, active items, ranges) |
| `--kino-radius`         | `12px`                                        | Corner radius of glass surfaces               |
| `--kino-surface`        | `color-mix(in oklab, black 55%, transparent)` | Glass surface fill                            |
| `--kino-surface-strong` | `color-mix(in oklab, black 70%, transparent)` | Stronger surface (idle play button)           |
| `--kino-border`         | `color-mix(in oklab, white 14%, transparent)` | Hairline borders                              |
| `--kino-text`           | `oklch(98% 0 0)`                              | Primary text and icons                        |
| `--kino-text-dim`       | `color-mix(in oklab, white 65%, transparent)` | Secondary text (timecode)                     |
| `--kino-blur`           | `18px`                                        | Backdrop blur radius                          |
| `--kino-shadow`         | `0 8px 40px rgba(0, 0, 0, 0.45)`              | Surface drop shadow                           |
| `--kino-ease`           | `cubic-bezier(0.22, 1, 0.36, 1)`              | Shared transition easing                      |

```css
.kino {
  --kino-accent: oklch(70% 0.15 250);
  --kino-radius: 16px;
  --kino-blur: 24px;
}
```

## Keyboard shortcuts

The player is keyboard-first. Shortcuts are ignored while a text input, textarea, select, or contenteditable element is focused, and modifier-key combinations (Ctrl/Cmd/Alt) are passed through.

| Key           | Action                                        |
| ------------- | --------------------------------------------- |
| `Space` / `K` | Play / pause                                  |
| `<` / `>`     | Decrease / increase playback rate (0.25 step) |
| `M`           | Toggle mute                                   |
| `C`           | Toggle captions                               |
| `S`           | Open the speed menu                           |
| `F`           | Toggle fullscreen                             |
| `0`-`9`       | Seek to 0%-90% of the duration                |

## Capability gating

Controls hide themselves when the active provider or platform cannot support them, rather than presenting a dead button. The provider reports a capability set, and each control checks it:

- Quality switching is hidden when the engine exposes no renditions, and is off on iOS where the system owns adaptive playback.
- Custom-chrome fullscreen is off on iOS (the platform uses its native fullscreen for the underlying video element).
- Picture-in-picture is hidden when the browser does not support it.
- The captions menu appears only when the media actually carries subtitle or caption tracks.

## Local development

```sh
pnpm install
pnpm dev        # demo harness at http://localhost:5173
pnpm test       # vitest
pnpm build      # bundle to dist/
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
```

`pnpm dev` runs the demo harness, which plays a public sample clip through a small demo file provider. No Mux account or signed tokens are needed to see the real glass UI. To exercise the Mux provider in the demo, set `VITE_MUX_PLAYBACK_ID` (and optionally the matching token env vars) before running `pnpm dev`.

## Roadmap

- More providers: YouTube, file, and Vimeo
- AirPlay support
- Chapters
- Documented headless primitives for fully custom chrome

## License

MIT
