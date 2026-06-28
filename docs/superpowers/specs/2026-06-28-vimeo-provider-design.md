# Vimeo provider — design

## Goal

Add a Vimeo provider to kino so the same glass chrome plays Vimeo videos,
mirroring the existing `mux/`, `native/`, and `youtube/` providers. Vimeo's
Player SDK is the richest of the iframe-backed engines — quality selection,
text tracks with cue text, picture-in-picture, and playback rate — so this
provider reports the widest capability set **and** is the first iframe provider
to render styled captions in kino's own overlay. Then update the README, demo
site, and overview copy so the docs advertise **four** shipped providers (Mux,
Native, YouTube, Vimeo).

## Architecture

kino's contract is `Provider` (`src/core/types.ts`): `mount(container)`,
`getState()`, `subscribe(listener)`, `actions`, `destroy()`, optional
`swapSource(opts)`. A thin React wrapper creates the provider once (`useRef`)
and routes reactive prop changes through `swapSource`. UI controls gate
themselves on the `capabilities` set the provider reports.

The Vimeo provider follows the `youtube/` shape (async-loaded iframe SDK, host
div, `destroyed` flag), but its state sync is **event-driven** like `native/`
rather than polled — the Vimeo SDK emits `timeupdate`.

### New files

- `src/vimeo/provider.ts` — `createVimeoProvider(opts): Provider` +
  `VimeoProviderOptions` type + `parseVimeoSource(input): { id; hash? }` helper.
- `src/vimeo/vimeo-player.tsx` — `<VimeoPlayer>` (props = `VimeoProviderOptions`
  + `accentColor/theme/className/placeholder/children`).
- `src/vimeo/provider.test.ts` — vitest, mirroring `youtube/provider.test.ts`
  (fake `window.Vimeo.Player`).
- `src/vimeo.ts` — entry re-exporting the provider, component, types, helper.

### Wiring

- `package.json` → add `exports["./vimeo"]` (`./dist/vimeo.{d.ts,js}`); add
  `"vimeo"` to `keywords` (mirrors the `youtube` entry).
- `tsdown.config.ts` → add `vimeo: "src/vimeo.ts"` entry.
- `src/styles/kino.css` → **no change**. The existing
  `.kino .kino-video-host iframe` rules (sizing + `pointer-events: none`, added
  for YouTube) already cover the Vimeo iframe, which lands inside
  `.kino-video-host`.
- No runtime dependency and no `@types/*` package — the SDK script is loaded at
  runtime and its surface is hand-rolled as a narrow local structural type
  (matching `MuxVideoEl` / the YouTube `YTPlayer` alias style).

## Engine integration

Vimeo Player SDK (`player.js`). A module-level singleton promise lazy-loads
`https://player.vimeo.com/api/player.js` and resolves when `window.Vimeo.Player`
is ready. An already-present `window.Vimeo` short-circuits. Unlike YouTube there
is **no global ready callback** — the injected `<script>`'s `onload` resolves
the promise (this shapes the test harness; see Testing).

`mount(container)` appends a host `<div>` and, once the SDK resolves, constructs
`new Vimeo.Player(hostDiv, options)`. The SDK injects an `<iframe>` inside the
div. The kino gesture overlay sits above the iframe and owns clicks/keys
(`controls: false` removes Vimeo's own chrome — see the plan caveat below).

Because mount is synchronous but player creation is async, the provider tracks a
`destroyed` flag: if `destroy()` runs before the player resolves, the player is
torn down (`player.destroy()`) as soon as it does.

### Readiness

The provider's `ready` flag flips on `player.ready()` (the SDK's iframe-init
promise). player.js internally queues method calls made before ready, so
fire-and-forget calls are safe regardless, but reads (`getDuration`,
`getQualities`, `getTextTracks`) and the capability refresh run in the `loaded`
handler, which fires once video metadata is available.

### Player options

```ts
new Vimeo.Player(host, {
  id,                 // numeric id (public videos)
  url,                // player.vimeo.com/video/ID?h=HASH (unlisted — see below)
  controls: false,    // kino owns the chrome (paid-plan feature — see caveat)
  autoplay: !!opts.autoPlay,
  muted: !!opts.muted,
  loop: !!opts.loop,
  playsinline: true,
  dnt: true,          // do-not-track; no analytics cookies
  keyboard: false,    // kino owns the keyboard map
})
```

Pass `id` for public videos; pass `url` when a hash is present (the hash
authorizes unlisted/private videos and must reach the embed). Use the
SDK-documented query form `https://player.vimeo.com/video/<id>?h=<hash>`.

> **Plan caveat (document in JSDoc).** `controls: false` (chromeless playback)
> requires a **paid** Vimeo plan. On a free-account video the flag is ignored:
> Vimeo's own controls render beneath kino's overlay, and because the iframe is
> `pointer-events: none`, the viewer sees but cannot use them. kino can't detect
> the plan, so the `<VimeoPlayer>` JSDoc must state that a chromeless-eligible
> (paid) source is required for the intended experience.

### Promise-based surface

Every Vimeo method returns a Promise. Actions call them fire-and-forget with a
trailing `.catch(() => {})` — a method that is plan-gated (`setPlaybackRate`,
`setQuality`), read-only on the platform (`setVolume` on iOS), or called against
a torn-down player rejects, and we swallow it. State is then driven by the
echo **event** (e.g. `playbackratechange`) rather than an optimistic patch, so
a rejected call never leaves the UI showing a change that did not happen.

## State mapping

Vimeo is event-driven — **no ticker**. `timeupdate` (~4×/sec during playback)
carries `{ seconds, duration, percent }` and `progress` carries the buffered
`{ seconds, duration, percent }`, so `currentTime`/`buffered` stay fresh without
polling.

| MediaState          | Source                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `paused`            | `play` → false; `pause`/`ended` → true; `bufferstart` keeps false |
| `ended`             | `ended` → true; cleared on `play`/`seeked`/swap                   |
| `currentTime`       | `timeupdate.seconds` (and `seeked`)                              |
| `duration`          | `timeupdate.duration` / `getDuration()` at `loaded`              |
| `buffered`          | `progress.percent` → `[[0, percent * duration]]`                |
| `rate`              | `playbackratechange.playbackRate` (re-asserted as `desiredRate`) |
| `volume`            | `volumechange.volume` (already `0..1`, no scaling)              |
| `muted`             | `volumechange.muted`; `getMuted()` at `loaded`                  |
| `qualities`         | `getQualities()` at `loaded` → `QualityLevel[]`                 |
| `activeQualityId`   | active entry id; `qualitychange.quality` (string id) thereafter |
| `textTracks`        | `getTextTracks()` at `loaded` → `TextTrackInfo[]`               |
| `activeTextTrackId` | synthesized id of the active track; `null` on `texttrackchange` disable |
| `activeCueText`     | `cuechange.cues[0].text` (cues rendered in kino's overlay)       |
| `pip`               | `enterpictureinpicture` / `leavepictureinpicture`               |
| `fullscreen`        | `fullscreenchange.fullscreen` / `document.fullscreenElement`     |
| `error`             | `error` → `{ code: 0, message: name ? `${name}: ${message}` : message }` |
| `readyState`        | 4 once `loaded` fires, else 0                                    |
| `storyboard`        | null — no scrub-preview source                                  |

`bufferstart`/`bufferend` keep `paused` honest during a mid-playback stall so
the poster cover doesn't flash (same intent as YouTube's `BUFFERING` handling).
`volumechange` carries `{ volume, muted }` — read **both** so an external
mute/unmute (e.g. an autoplay-muted video being unmuted) doesn't drift
`state.muted`. The `error` payload is `{ message, name, method? }` with **no
numeric code**, so `code` is a fixed `0` and `name` is folded into the message.

## Capabilities

| Capability      | Value                                       | Reason                                                    |
| --------------- | ------------------------------------------- | --------------------------------------------------------- |
| `canSetRate`    | true (best-effort — see note)               | `setPlaybackRate` works on Pro/Business; can't be probed cheaply. |
| `canFullscreen` | true                                        | We fullscreen the kino wrapper; the iframe is inside it.   |
| `canPiP`        | `!!document.pictureInPictureEnabled`        | SDK `requestPictureInPicture` where the browser allows it. |
| `canSetQuality` | `getQualities().length > 0` (set at `loaded`) | Quality API is plan-gated; an empty/failed call ⇒ no menu. |
| `hasTextTracks` | `getTextTracks().length > 0` (set at `loaded`) | `getTextTracks` returns the caption list.              |
| `hasStoryboard` | false                                       | No scrub-preview source.                                  |

`canSetQuality` and `hasTextTracks` start `false` and flip on once the `loaded`
handler reads non-empty lists — so a plan that lacks the quality API simply
never shows the menu (no dead button). `canSetRate` cannot be detected before a
`setPlaybackRate` attempt, so it is reported `true` as best-effort: if the call
rejects (free/Personal plan), `playbackratechange` never fires and the rate
state stays put rather than lying. `canPiP` reads
`document.pictureInPictureEnabled` at creation (note: **undefined in Firefox**,
which has its own PiP and will report `false` here; the cross-origin request
also needs a user gesture, which kino's button click supplies).

## Actions

All gated on `ready`; all Promise calls carry `.catch(() => {})`; state changes
land via the echo event, not an optimistic patch (except `seek`, which patches
`seeking` immediately for responsiveness).

| Action            | Implementation                                                      |
| ----------------- | ------------------------------------------------------------------ |
| `play / pause`    | `player.play() / player.pause()`                                   |
| `seek(t)`         | `player.setCurrentTime(t)`; patch `seeking: true`                  |
| `setRate(r)`      | store `desiredRate = r`; `player.setPlaybackRate(r)` — `rate` patched on `playbackratechange` |
| `setVolume(v)`    | `player.setVolume(v)` — `0..1`, no scaling                          |
| `setMuted(m)`     | `player.setMuted(m)` — `muted` patched on `volumechange`            |
| `setQuality(id)`  | `player.setQuality(id)` (`"auto"` for adaptive) — patched on `qualitychange` |
| `setTextTrack(id)`| resolve id → `{language, kind}`; `enableTextTrack(language, kind, false)` or `disableTextTrack()` |
| `enterFullscreen` | `wrapper.requestFullscreen()` (kino wrapper, controls stay on top)  |
| `exitFullscreen`  | `document.exitFullscreen()`                                         |
| `enterPiP`        | `player.requestPictureInPicture()`                                 |
| `exitPiP`         | `player.exitPictureInPicture()`                                    |

### Quality mapping

`getQualities()` returns `[{ id, label, active }]` where `id` is the resolution
token (`"2160p"`, `"1080p"`, `"auto"`) and `label` is a human string (`"4K"`,
`"1080p"`, `"Auto"`). Map to kino's `QualityLevel`:

```
{ id, height: parseInt(id) || 0, bitrate: 0, selected: active }
```

**Height is parsed from `id`, not `label`** — `parseInt("4K")` is `4`. Vimeo
exposes no bitrate, so `bitrate: 0`. `activeQualityId` is the `active` entry's
`id`, falling back to `"auto"`; `qualitychange` carries `{ quality }` (the new
id string) thereafter.

### Captions

Unlike YouTube, this provider renders cues in kino's own overlay. `getTextTracks`
returns `{ label, language, kind, mode }` with **no `id`**, so the provider
synthesizes a stable id `${language}.${kind}` (with an index suffix on
collision) for `textTracks[]` and `activeTextTrackId`. `setTextTrack(id)`
resolves that back to `{ language, kind }` and calls
`enableTextTrack(language, kind, /* showing */ false)` — the `false` keeps the
player from painting its own cues while still emitting `cuechange`. The provider
maps `cuechange.cues[0].text` into `activeCueText`, so kino's styled
`.kino-captions` overlay shows the caption (the same path `native/` uses).
`disableTextTrack()` clears it (`activeTextTrackId: null`, `activeCueText: ""`).
`texttrackchange` (payload `{ kind, label, language }`, all null when disabled)
reconciles `activeTextTrackId` against the synthesized scheme.

> iOS caveat (mirror `native/`): during iOS native fullscreen the system paints
> its own captions; the provider should not double-render. Follow native's iOS
> branch if the same condition applies.

## Options

```ts
type VimeoProviderOptions = {
  videoId: string // numeric id, or any vimeo.com / player.vimeo.com URL
  hash?: string // unlisted/private hash; also parsed from the URL
  metadata?: { videoId?: string; videoTitle?: string; viewerUserId?: string }
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  defaultRate?: number
}
```

`parseVimeoSource(input)` returns `{ id, hash? }` and accepts:

| Input                                          | → id        | → hash       |
| ---------------------------------------------- | ----------- | ------------ |
| `123456789` (bare)                             | `123456789` | —            |
| `https://vimeo.com/123456789`                  | `123456789` | —            |
| `https://vimeo.com/123456789/abcdef0123`       | `123456789` | `abcdef0123` |
| `https://player.vimeo.com/video/123456789?h=X` | `123456789` | `X`          |

An explicit `hash` option wins over a URL-derived one. A bare id passes through
unchanged (input returned as id if no numeric match). When a hash is present the
provider builds the documented `https://player.vimeo.com/video/<id>?h=<hash>`
URL for the SDK; otherwise it passes the numeric `id`.

### swapSource and the hash channel

`SourceOptions` (`{ playbackId, src, poster, tokens, metadata }`) has **no
`hash` field**, so the hash can't travel as a separate property. Instead,
`<VimeoPlayer>` packs the source into `src` as a single string: when a hash is
present it passes the full `player.vimeo.com/video/ID?h=HASH` URL; otherwise the
bare id. `swapSource` runs `parseVimeoSource(next.src)` to recover `{ id, hash }`
and calls `player.loadVideo(hash ? { url } : id)`, then resets
`currentTime/duration/ended/error`, re-asserts `desiredRate`, and refreshes the
media-session title. (Re-asserting the rate after a load is defensive — that
Vimeo resets `playbackRate` on `loadVideo` is **assumed, not doc-confirmed**;
the re-assert is harmless either way.)

Like the other providers, `autoPlay/muted/loop/defaultRate` are read once at
creation.

### `<VimeoPlayer>` reactive machinery

Replicate `youtube-player.tsx` exactly, with `hash` threaded through:

- `providerRef = useRef<Provider|null>(null)`; create the provider only when
  `null`, so `<Player>`'s mount effect runs once and the iframe persists.
- `mountedRef` skip-first guard so the initial render doesn't fire a redundant
  `swapSource` (the source is already set at creation).
- The swap effect builds `src` from `videoId` + `hash`
  (`hash ? playerUrl(videoId, hash) : videoId`) and passes `metadata`; its
  dependency array is `[opts.videoId, opts.hash, opts.metadata?.videoTitle]` —
  note `hash` is included (YouTube has no equivalent).

## Testing

Mirror `youtube/provider.test.ts`, mocking `window.Vimeo.Player` with a fake
`Player` that (a) records method calls, (b) returns resolved Promises from the
async methods, and (c) lets tests emit events by invoking the handlers
registered via `on(event, fn)`. Because there is no global ready callback, the
harness differs from YouTube's:

- For normal tests, **pre-set `window.Vimeo.Player`** so the loader
  short-circuits synchronously.
- For the loader / early-destroy tests, leave `window.Vimeo` unset, then grab
  the injected `<script>` and **dispatch its `load` event manually** (jsdom does
  not fire it) to drive the singleton promise.

Cover:

- initial state defaults + the capability set (with `canSetQuality`/
  `hasTextTracks` starting `false`, then flipping on after `loaded`);
- `parseVimeoSource` across every URL form + bare id + explicit-hash precedence;
- unlisted construction passes the `?h=` `url`, public passes `id`;
- actions call the right SDK methods (`setVolume` unscaled; `setQuality`;
  `enableTextTrack(lang, kind, false)` / `disableTextTrack`; PiP enter/exit);
- `loaded` populates duration, qualities (height parsed from `id`, incl. a `4K`
  ⇒ height `2160` case via `id:"2160p"`), and text tracks (synthesized ids, no
  collision for same-language different-kind tracks);
- event sync: `timeupdate`/`progress` update time+buffered; `cuechange` →
  `activeCueText`; `volumechange.muted` reconciles mute; `qualitychange.quality`;
  `texttrackchange`; `enter/leavepictureinpicture`; `fullscreenchange`;
- rate: `setRate` does **not** patch `rate` optimistically; `rate` only moves on
  `playbackratechange`, and `desiredRate` survives a `swapSource`;
- `swapSource` calls `loadVideo` (with `{ url }` when the new src carries a hash)
  and resets progress;
- deferred readiness — no SDK method runs before the loader resolves;
- `destroy` tears the player down, and an early `destroy()` (before the SDK
  script's `load`) leaves no live player.

## Docs / demo updates

- **README.md** — add Vimeo to the shipped-providers list; add a "Playing a
  Vimeo video" section (incl. an unlisted-with-hash example); drop Vimeo from
  the roadmap.
- **demo/pages/providers.tsx** — Vimeo card `planned` → `shipped` with `entry`
  (`@karnstack/kino/vimeo`) + `importLine`
  (`import { VimeoPlayer } from "@karnstack/kino/vimeo"`); the detail copy should
  note the chromeless/paid-plan requirement.
- **demo/pages/install.tsx** — Vimeo snippet + `VimeoPlayer` props table.
- **demo/pages/overview.tsx** — highlight copy: Vimeo now ships.
- **demo/player-studio.tsx** — add a "Vimeo" provider tab playing a public,
  chromeless-eligible id.
- **.changeset/** — a `minor` changeset describing the new provider.

## Embed terms

Like YouTube, kino must not obscure the Vimeo player: no poster-on-pause cover
over the embed. kino's controls sit alongside Vimeo's surface. Documented in the
`<VimeoPlayer>` component JSDoc, together with the chromeless/paid-plan note.

## Out of scope

AirPlay, chapters, Vimeo analytics events, live-stream–specific controls, and
runtime detection of the account plan (kino documents the chromeless/paid
requirement rather than probing for it).
