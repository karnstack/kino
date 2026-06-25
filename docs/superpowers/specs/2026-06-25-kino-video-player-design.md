# kino — video player design (v0.0.1)

Date: 2026-06-25
Status: approved, pre-implementation

## Summary

`kino` is a premium, themeable React video player UI with a **provider
abstraction** underneath. The glass controls, popovers, keyboard handling, and
theming are written once against a normalized media interface; each *provider*
adapts a concrete playback engine to that interface. Mux is the first provider.

It ships as a **public** OSS package `@karnstack/kino` from a standalone repo
(`github.com/karngyan/kino`). karnstack's `apps/web` is the first consumer,
replacing the current default Mux player skin in
`apps/web/src/components/course/lesson-video.tsx`.

The target aesthetic is a translucent, macOS-style glass player: a hover-zoom
idle play button with a playback-speed pre-select bar, a backdrop-blurred
control bar, snappy popovers with visible keyboard-shortcut badges, and a
storyboard thumbnail preview on scrub.

## Goals

- A beautiful, themeable player that looks great out of the box (styled
  drop-in), built on a headless core so unstyled/headless usage can fall out
  later.
- Provider-pluggable: Mux now; YouTube / plain HLS / file later, same UI.
- karnstack adopts it without losing any current behavior (token swap across
  lessons, fullscreen continuity, autoplay-next, rate persistence).
- Clean open-source story: framework-agnostic CSS, no auth coupling, MIT.

## Non-goals (deferred to a later version)

- Additional providers (YouTube, file, Vimeo).
- AirPlay, chapters UI.
- Framework-agnostic web-component core; React is the only target for v0.0.1.
- Published headless-primitives documentation (the headless core exists
  internally but is not a documented public surface yet).

## Why not the alternatives

- **Default `@mux/mux-player-react` skin** (current): a styled web component;
  deep restyling fights its shadow DOM. Too basic and not the target look.
- **Compose Media Chrome web components**: less code to "good", but
  shadow-DOM/slots constrain the bespoke hover-zoom play button and custom
  popovers. Harder to hit the exact feel.
- **Chosen: custom React controls over a headless media element.** Maximum
  control over look, animation, popovers, theming, and a11y.

## Architecture

Three layers, top to bottom:

```
┌─────────────────────────────────────────────────────────┐
│  UI Shell (React)                                         │  pure presentation:
│  glass chrome, hover-zoom idle, popovers, scrubber,       │  reads state via
│  keyboard, theming                                        │  selectors, calls actions
├─────────────────────────────────────────────────────────┤
│  Player store + controller                                │  normalized MediaState +
│  (useSyncExternalStore, selector subscriptions)           │  actions (play/seek/rate/…)
├─────────────────────────────────────────────────────────┤
│  Provider (engine adapter)                                │  MuxProvider wraps raw
│  src resolution, events→state, actions→engine, caps       │  <mux-video>: tokens, HLS,
│                                                           │  Mux Data, renditions, PiP
└─────────────────────────────────────────────────────────┘
```

### MediaState (normalized)

```
paused, currentTime, duration, buffered (TimeRanges|ranges),
rate, volume, muted, readyState, seeking, ended, error,
qualities: { id, height, bitrate, selected }[], activeQualityId | "auto",
textTracks: { id, kind, label, lang, mode }[], activeTextTrackId,
fullscreen, pip,
storyboard: { vttUrl } | null,
capabilities
```

### Capabilities (per provider, drives capability-gating)

```
canSetQuality, hasStoryboard, canPiP, canFullscreen (custom-chrome),
canSetRate, hasTextTracks
```

The UI hides any control whose capability is false. Example: on iOS the Mux
provider reports `canSetQuality: false` (native HLS cannot switch renditions)
and `canFullscreen: false` for custom chrome (iOS uses native fullscreen), so
the quality menu and our fullscreen button gracefully disappear.

### Store

Zero-dependency store built on `useSyncExternalStore` with **selector
subscriptions**, so a high-frequency `timeupdate` (~4 Hz) only re-renders the
scrubber and time display, not the entire control bar.

### Provider interface

```
interface Provider {
  mount(container): void          // creates/attaches the engine element
  getState(): MediaState
  subscribe(listener): () => void
  actions: {
    play, pause, seek(t), setRate(r), setVolume(v), setMuted(b),
    setQuality(id | "auto"), setTextTrack(id | null),
    enterFullscreen(wrapper), exitFullscreen, enterPiP, exitPiP,
  }
  capabilities: Capabilities
  destroy(): void
}
```

## Mux provider — verified API facts (June 2026)

These facts are confirmed against Mux docs + the `muxinc/elements` source and
shape the implementation:

- **Use the raw `<mux-video>` custom element via a ref — not
  `@mux/mux-video-react`.** The React wrapper does NOT expose the Media
  Renditions API (needed for the quality menu) and lacks thumbnail/storyboard
  token props. Mux's own player.style site uses raw `<mux-video>` in React for
  this reason.
- **Standard HTMLMediaElement.** `<mux-video>` fires `timeupdate`, `play`,
  `pause`, `volumechange`, `ratechange`, `progress`, `loadedmetadata`, `ended`,
  `waiting`, `canplay`, `error`, `seeking`/`seeked`, `durationchange`, and
  exposes `currentTime`, `duration`, `buffered`, `paused`, `playbackRate`,
  `volume`, `muted`, `play()`, `pause()`, `requestPictureInPicture()`. The
  provider maps these to MediaState.
- **Quality / renditions** via the Media Renditions API on the element:
  `videoRenditions` list with `{ id, width, height, bitrate, frameRate, codec,
  selected }`, `selectedIndex`, and a `change` event. Switch by setting
  `videoRenditions.selectedIndex = n` or `rendition.selected = true`; reset for
  Auto/ABR. **Not available on iOS** (native HLS) → capability-gate off. With
  signed URLs, resolution caps must be baked into the JWT claims
  (`max_resolution` etc.), not attributes.
- **Signed tokens**: raw `<mux-video>` has NO `thumbnail-token` /
  `storyboard-token` attributes. The playback token rides on the playback id:
  `playback-id="{ID}?token={JWT}"`. For thumbnails/storyboard, the provider
  constructs `image.mux.com` URLs itself:
  `https://image.mux.com/{ID}/storyboard.vtt?token={storyboardJWT}` and
  `https://image.mux.com/{ID}/thumbnail.webp?token={thumbnailJWT}`. Token
  audiences: `v` playback, `t` thumbnail, `s` storyboard. Add `crossorigin`
  to the element (image host differs from stream host). Signed options must be
  baked into the token, not appended as query params.
- **Storyboard scrub preview** is built by us: fetch + parse
  `storyboard.vtt`, then crop the sprite tile per cue via the
  `#xywh=x,y,w,h` media-fragment. No helper on `mux-video`.
- **Mux Data** auto-wires via `env-key` (prop `envKey`) + a `metadata` object
  (snake_case keys: `video_id`, `video_title`, `viewer_user_id`).
- **Captions**: standard `<track>` children + `element.textTracks`; set
  `track.mode = "showing" | "disabled"`. No Mux-specific surface.
- **PiP**: `requestPictureInPicture()`. **Fullscreen**: call
  `requestFullscreen()` on our wrapper so custom chrome shows; on iPhone,
  fullscreen is native chrome (`webkitEnterFullscreen`), so custom-chrome
  fullscreen is capability-gated off there.
- **HLS**: bundled hls.js with Mux-tuned settings, auto-upgraded; native HLS on
  Safari/iOS. Only the standard media `error` event is exposed (no hls.js error
  codes).

## Package & repo

Standalone public repo `github.com/karngyan/kino`, published as
`@karnstack/kino`. Subpath exports keep provider engine deps out of the core:

```
@karnstack/kino             → <Player>, usePlayer(), primitives, types, theme   (no engine deps)
@karnstack/kino/mux         → <MuxPlayer> + Mux provider   (dep: mux-video)
@karnstack/kino/youtube     → (later) <YouTubePlayer> + YT provider
@karnstack/kino/styles.css  → shipped stylesheet
```

- React 19 + TypeScript (strict), ESM-first, built with `tsup` (JS + types).
  `react` / `react-dom` are peer dependencies.
- **No Tailwind required by consumers.** Styles ship as a single standalone
  `kino.css` scoped under a `.kino` root class; theming via CSS custom
  properties. Authoring tool internal; output is framework-agnostic and must
  not leak a global reset / preflight onto the consumer page.
- MIT license. No reference to any commercial product (including the visual
  inspiration) anywhere in the repo, docs, or commit history.
- Versioning via Changesets. CI: typecheck + lint + build. A local demo route
  (e.g. a Vite playground in the repo) exercises the player during dev.

## Component API

```tsx
// Styled drop-in (the karnstack path)
<MuxPlayer
  playbackId={id}
  tokens={{ playback, thumbnail, storyboard }}   // signed tokens passed IN — player is auth-agnostic
  metadata={{ videoId, videoTitle, viewerUserId }}
  poster={blurupDataUrl}
  accentColor="oklch(50.8% 0.118 165.612)"        // or theme="emerald" | full token object
  theme={{ ... }}                                  // optional CSS-var overrides
  autoPlay
  defaultRate={1}
  onEnded={...}
  onRateChange={...}
  onTimeUpdate={...}
  fullscreenElement={wrapperRef}                   // continuity hook (see Integration)
>
  <Player.Overlay>{/* app slot: next-lesson CTA, swap veil, etc. */}</Player.Overlay>
</MuxPlayer>

// Headless-ish: bring your own provider / compose primitives later
<Player provider={createMuxProvider({ playbackId, tokens, metadata })}>…</Player>
const { paused, currentTime, play, seek } = usePlayer()
```

App-specific concerns (next-lesson overlay, autoplay-next decisions, rate
persistence) are slots/callbacks, never baked into the player.

## UI surfaces

1. **Idle / hover-zoom**: centered play button scales up on hover; a
   playback-speed pre-select bar (0.8× / 1× / 1.2× / 1.5× / 1.7× / 2× / Max)
   fades in so the viewer can set rate before playback begins.
2. **Glass control bar**: translucent backdrop-blur bar — play/pause, scrubber +
   time `00:03 / 01:08`, speed, quality, captions, PiP, fullscreen. Auto-hides
   on idle, reveals on pointer move / focus.
3. **Scrubber**: hover shows a storyboard thumbnail preview + timestamp
   tooltip; buffered-range shading on the track; smooth drag-to-seek.
4. **Popovers**: snappy glass popovers (speed, quality, captions) with visible
   keyboard-shortcut badges (e.g. `Speed S`).
5. **Keyboard map**: space (play/pause), ←/→ (±5s), ↑/↓ (volume), `f`
   (fullscreen), `m` (mute), `c` (captions), `s` (speed popover), `0–9` (seek to
   %), `<` / `>` (rate down/up). Disabled while focus is in an input/textarea/
   contenteditable.
6. **Theming**: `accentColor` + light/dark + a CSS-variable token set (surface
   blur, radius, text colors). a11y: focus rings, ARIA roles/labels,
   `prefers-reduced-motion` respected.

## karnstack integration

Replace the internals of `apps/web/src/components/course/lesson-video.tsx` with
`<MuxPlayer>`, preserving every current behavior through the public API:

- **Token swap without unmount across lessons**: keep the persistent element;
  feed new `playbackId` + `tokens` props; render the "Loading next lesson…" veil
  via `<Player.Overlay>`.
- **Fullscreen continuity across lesson nav**: the player fullscreens a stable
  wrapper (`fullscreenElement`), not `document`, so overlays persist and
  fullscreen survives the swap — same approach as today.
- **Autoplay-next + end overlay**: `onEnded` callback drives karnstack's
  autoplay decision; the "Up next" CTA renders in `<Player.Overlay>`.
- **Rate persistence**: stays in karnstack (localStorage) via `defaultRate` +
  `onRateChange`; the player is stateless about persistence.
- **Signed tokens**: still minted server-side in karnstack
  (`src/lib/mux/sign-playback.ts`) and passed in as props. kino never touches
  Clerk/auth.

The pre-first-load states (loading / not_ready / unauthorized / forbidden /
error) remain karnstack's responsibility around the player, unchanged.

## Risks / open items

- Standalone-CSS build must not leak a preflight/global reset onto consumer
  pages — scope everything under `.kino`.
- Confirm the `videoRenditions` list is populated for our signed Mux assets in
  practice; if a given asset exposes no switchable renditions, the quality menu
  capability-gates off for that asset.
- Verify storyboard `.vtt` + signed `s` token render correctly for our assets
  before committing the scrub-preview feature; fall back to a plain time
  tooltip if unavailable.
- `mux-video` bundle size is not officially published; measure in the karnstack
  bundle and document it.

## Scope (v0.0.1)

In: Mux provider on raw `<mux-video>`, hover-zoom + speed pre-select, glass
control bar, storyboard scrub preview, speed / quality / captions popovers with
keyboard badges, PiP, custom-chrome fullscreen, theming, a11y, capability
gating, and the karnstack swap-in.

Deferred: YouTube/file providers, AirPlay, chapters, framework-agnostic
web-component core, documented headless primitives.
