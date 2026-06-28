# YouTube provider — design

## Goal

Add a YouTube provider to kino so the same glass chrome plays YouTube videos,
mirroring the existing `mux/` and `native/` providers. Then update the README,
demo site, and overview copy so the docs advertise **three** shipped providers
(Mux, Native, YouTube) instead of framing Mux as the only/first one.

## Architecture

kino's contract is `Provider` (`src/core/types.ts`): `mount(container)`,
`getState()`, `subscribe(listener)`, `actions`, `destroy()`, optional
`swapSource(opts)`. A thin React wrapper creates the provider once
(`useRef`) and routes reactive prop changes through `swapSource`. UI controls
gate themselves on the `capabilities` set the provider reports.

The YouTube provider follows the `native/` shape exactly.

### New files

- `src/youtube/provider.ts` — `createYouTubeProvider(opts): Provider` +
  `YouTubeProviderOptions` type + `parseYouTubeId(input): string` helper.
- `src/youtube/youtube-player.tsx` — `<YouTubePlayer>` (props =
  `YouTubeProviderOptions` + `accentColor/theme/className/placeholder/children`).
- `src/youtube/provider.test.ts` — vitest, mirroring `native/provider.test.ts`.
- `src/youtube.ts` — entry re-exporting the provider, component, types, helper.

### Wiring

- `package.json` → add `exports["./youtube"]`.
- `tsdown.config.ts` → add `youtube: "src/youtube.ts"` entry.
- `package.json` `devDependencies` → `@types/youtube` (global `YT` typings only;
  no runtime dependency — the IFrame API script is loaded at runtime).
- `src/styles/kino.css` → add `.kino iframe` to the existing
  `.kino mux-video, .kino video { inset:0; width/height:100% }` rule.

## Engine integration

YouTube IFrame Player API. A module-level singleton promise lazy-loads
`https://www.youtube.com/iframe_api` and resolves when `window.YT.Player` is
ready (chaining the existing global `onYouTubeIframeAPIReady` callback so
multiple players coexist). Already-loaded `window.YT` short-circuits.

`mount(container)` appends a host `<div>` and, once the API resolves, constructs
`new YT.Player(hostDiv, { videoId, playerVars: { controls: 0, playsinline: 1,
rel: 0, modestbranding: 1, autoplay, mute, loop, playlist }, events })`. The API
replaces the div with an `<iframe>`. The kino gesture overlay sits above the
iframe and owns clicks/keys (`controls: 0` hides YouTube's own chrome).

Because mount is synchronous but player creation is async, the provider tracks a
`destroyed` flag: if `destroy()` runs before the player is ready, the player is
torn down as soon as it resolves.

### Hand-rolled vs typed

`@types/youtube` supplies the global `YT` namespace types (devDependency).
Provider internals reference `YT.Player` through a narrow local alias so the
file stays self-contained, matching the `MuxVideoEl` structural-type style.

## State mapping

YT fires no `timeupdate`. A ~250ms ticker (`setInterval`) runs while a player
exists and pushes `currentTime`, `duration`, and `buffered`. `onStateChange`
drives play/pause/ended transitions immediately.

| MediaState                          | Source                                                           |
| ----------------------------------- | ---------------------------------------------------------------- |
| `paused`                            | state `PLAYING(1)` → false; `PAUSED/ENDED/CUED/UNSTARTED` → true |
| `ended`                             | state `ENDED(0)`                                                 |
| `currentTime`                       | `getCurrentTime()`                                               |
| `duration`                          | `getDuration()`                                                  |
| `buffered`                          | `[[0, getVideoLoadedFraction() * duration]]`                     |
| `rate`                              | `getPlaybackRate()` (re-asserted as `desiredRate`)               |
| `volume`                            | `getVolume() / 100`                                              |
| `muted`                             | `isMuted()`                                                      |
| `error`                             | `onError(code)` → `{ code, message }`                            |
| `readyState`                        | 4 once a video is cued/playing, else 0                           |
| qualities / textTracks / storyboard | empty / null                                                     |

## Capabilities

| Capability      | Value | Reason                                                   |
| --------------- | ----- | -------------------------------------------------------- |
| `canSetRate`    | true  | `setPlaybackRate` works.                                 |
| `canFullscreen` | true  | We fullscreen the kino wrapper; the iframe is inside it. |
| `canSetQuality` | false | IFrame API removed manual quality selection.             |
| `canPiP`        | false | No PiP handle on a cross-origin iframe.                  |
| `hasTextTracks` | false | Caption control over the iframe API is unofficial.       |
| `hasStoryboard` | false | No scrub-preview source.                                 |

Gated controls (quality menu, PiP button, captions menu, storyboard preview)
hide themselves automatically — no dead buttons.

## Actions

| Action               | Implementation                                          |
| -------------------- | ------------------------------------------------------- |
| `play / pause`       | `playVideo() / pauseVideo()`                            |
| `seek(t)`            | `seekTo(t, true)`                                       |
| `setRate(r)`         | `setPlaybackRate(r)`; store `desiredRate`; patch `rate` |
| `setVolume(v)`       | `setVolume(v * 100)`                                    |
| `setMuted(m)`        | `mute() / unMute()`                                     |
| `setQuality`         | no-op                                                   |
| `setTextTrack`       | no-op                                                   |
| `enterFullscreen`    | `wrapper.requestFullscreen()` (same as native)          |
| `exitFullscreen`     | `document.exitFullscreen()`                             |
| `enterPiP / exitPiP` | no-op                                                   |

## Options

```ts
type YouTubeProviderOptions = {
  videoId: string // a raw id; parseYouTubeId() accepts a URL too
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}
```

`parseYouTubeId(input)` accepts a bare id, `watch?v=`, `youtu.be/`, `/embed/`,
and `/shorts/` URLs, returning the 11-char id (input returned unchanged if no
match, so a bare id passes through).

`swapSource` reacts to `videoId` (→ `loadVideoById` / `cueVideoById` per
`autoPlay`) and `metadata.videoTitle` (→ media-session title). Like the other
providers, `muted/loop/defaultRate/autoPlay` are read once at creation.

## Testing

Mirror `native/provider.test.ts`, mocking `window.YT` with a fake `Player` that
records method calls (jsdom has no IFrame API). Cover: initial state defaults;
capability set; `parseYouTubeId` across URL forms; actions call the right YT
methods; `setRate` reflects immediately and survives a swap; `swapSource` calls
`loadVideoById` and resets progress; `destroy` tears down the player and ticker.

## Docs / demo updates

- **README.md** — replace "Mux is the first provider" framing with three shipped
  providers; add a "Playing a YouTube video" section; update the roadmap (drop
  YouTube from "planned").
- **demo/pages/providers.tsx** — YouTube card `planned` → `shipped` with entry +
  import line.
- **demo/pages/install.tsx** — YouTube snippet + `YouTubePlayer` props table.
- **demo/pages/overview.tsx** — highlight copy: YouTube now ships.
- **demo/player-studio.tsx** — add a "YouTube" provider tab playing a public id.
- **.changeset/** — a `minor` changeset describing the new provider.

## Out of scope

Vimeo, AirPlay, chapters, YouTube captions/quality control (API limits).
