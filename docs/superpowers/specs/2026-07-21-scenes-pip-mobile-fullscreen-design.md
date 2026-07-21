# Scenes PiP + Mobile Fullscreen Design

Date: 2026-07-21
Status: approved
Scope: `@karnstack/kino` scenes entry only. No changes to mux/native/vimeo/youtube providers.

## Problem

Scene-sequence playback lost two features that video-element providers get for free:

1. **Picture-in-picture.** `canPiP` is hardcoded `false` in the scenes provider because there is no parent-side `<video>` to promote via `requestPictureInPicture()`. The stage is live DOM inside a cross-origin iframe.
2. **Fullscreen on iPhone-class WebKit.** `enterFullscreen` calls only `wrapper.requestFullscreen?.()` (`src/scenes/provider.ts:156`). iPhone WebKit (Safari and every iOS browser, including Chrome, which is the same engine) does not implement `Element.requestFullscreen` at all. Video providers fall back to `video.webkitEnterFullscreen()`; scenes has no video element, so the fullscreen button silently does nothing.

## Decisions (approved)

- PiP ships via the **Document Picture-in-Picture API**, Chromium desktop only. The button hides everywhere else through the existing `canPiP` capability gate. Safari/Firefox/mobile get no scenes PiP; accepted trade-off (video-element playback keeps PiP everywhere).
- Mobile fullscreen ships as a **pseudo-fullscreen CSS fallback** used only when `requestFullscreen` is absent. Kino's custom chrome stays on screen, which is better UX than the native iPhone video fullscreen that video providers fall back to.

## Design

### 1. Pseudo-fullscreen fallback

New util `src/util/pseudo-fullscreen.ts`:

```ts
// Applies fixed-position fullscreen styling to the wrapper and locks page
// scroll. Returns a restore function that undoes everything it changed.
export function enterPseudoFullscreen(wrapper: HTMLElement): () => void
```

Behavior:

- Saves the wrapper's inline `style` values it will touch, then sets: `position: fixed`, `inset: 0`, `width: 100vw`, `height: 100dvh`, `zIndex: 2147483647`, `background: #000`, and safe-area padding `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)`.
- Locks scroll by saving and setting `overflow: hidden` on both `document.documentElement` and `document.body`.
- The restore function reinstates every saved inline value exactly (including empty-string removals) and is idempotent (second call is a no-op).

Scenes provider integration (`src/scenes/provider.ts`):

- `enterFullscreen(wrapper)`: if `wrapper.requestFullscreen` exists, call it (unchanged native path; `fullscreenchange` listener keeps patching state). Otherwise call `enterPseudoFullscreen(wrapper)`, keep the restore fn in a local, and `patch({ fullscreen: true })` directly, because no `fullscreenchange` event fires in pseudo mode.
- `exitFullscreen()`: if a pseudo restore fn is held, call it, clear it, `patch({ fullscreen: false })`. Else the existing native path.
- `destroy()`: if a pseudo restore fn is held, call it (sequence swap while pseudo-fullscreen must not leave the page scroll-locked).
- `enterFullscreen` is a no-op while PiP is active (the stage is in another window; the button is in the main tab).

No changes to mux/native providers: their `webkitEnterFullscreen` fallback works today and native video fullscreen behavior on iPhone is out of scope.

### 2. Document PiP

Capability (`src/scenes/provider.ts` state init):

```ts
canPiP: typeof window !== "undefined" && "documentPictureInPicture" in window,
```

`PipButton` and its `state.pip` icon/tooltip wiring already exist; no UI changes.

**enterPiP()** (no-op if unsupported, already in PiP, or before mount):

1. Capture resume state: `{ time: state.currentTime, playing: !state.paused }` into a `resume` local.
2. If pseudo-fullscreen is active, restore it and `patch({ fullscreen: false })` first.
3. `await documentPictureInPicture.requestWindow({ width, height })` sized to the stage's aspect ratio (width 480, height derived from the container's `clientWidth/clientHeight`, defaulting to 270 when unknown). Requires transient user activation; the button click provides it. A rejected promise leaves state untouched.
4. Move the iframe: `pipWindow.document.body.appendChild(iframe)`. Cross-document move reloads the iframe; that is unavoidable and handled by the resume path below. Style the pip body (margin 0, background #000) and the iframe (100% x 100%, border 0).
5. Add the provider's `onMessage` listener to `pipWindow` as well: the host posts events to `window.parent`, which inside the pip window is the pip window itself, not the main tab. The existing origin and source checks apply unchanged.
6. Mount the pip overlay and the inline placeholder (below). `patch({ pip: true })`.
7. Listen for `pagehide` on the pip window; that single handler performs all exit work (user close button, `exitPiP()`, tab navigation).

**Resume path.** The `kino:ready` handler branches: when `resume` is set, send `kino:init` with `startTime: resume.time` and `autoPlay: resume.playing`, then clear `resume`. Otherwise send the current default init. The same mechanism restores playback both entering and leaving PiP (both moves reload the iframe).

**exitPiP()**: `pipWindow.close()`. All teardown lives in the `pagehide` handler:

- Capture resume state again (position may have advanced while in PiP).
- Move the iframe back into the original mount container (provider stores the `container` from `mount()`).
- Remove the pip-window message listener, remove the placeholder and overlay, drop the `pipWindow` ref, `patch({ pip: false })`.

**destroy()** while PiP is active: remove listeners, `pipWindow.close()`, and proceed with normal teardown. The iframe may die with the closing window; `destroy()` still calls `iframe?.remove()` harmlessly.

**Pip overlay** (parent-origin DOM appended to the pip window body, positioned over the stage): a bottom gradient bar containing a play/pause toggle and the active caption cue text (captions render in the main tab's chrome, which is not visible from the pip window). Implemented with inline styles, independent of `kino.css` (stylesheet copying into the pip window is not worth it for two elements). Wired directly to `actions.play/pause` and a provider `subscribe` callback; the subscription is removed in the `pagehide` handler.

**Inline placeholder**: while PiP is active the provider mounts a `div.kino-pip-placeholder` into the empty container: black background, centered sentence-case text "Playing in picture in picture", clickable, `onclick = exitPiP`. Styled via a new rule in `src/styles/kino.css` following the existing `.kino-placeholder` conventions.

### 3. Protocol additions (additive, backward compatible)

`src/scenes/protocol.ts`:

- `kino:init` gains optional `startTime?: number`.

`src/scenes/host.tsx`:

- On `kino:init` with `startTime`, set `audio.currentTime = startTime` (clamped to `[0, duration]`) before honoring `autoPlay`.
- `autoPlay` failure is tolerated: `void audio.play().catch(() => {})`. The reloaded pip iframe may lack user activation; a rejected play leaves the host paused and the pip overlay shows the play button. Not an error.
- Command source check widens from `ev.source !== window.parent` to also accept `window.parent.opener` (`ev.source === window.parent || ev.source === window.parent.opener`). Inside a docPiP window the host's parent is the pip window while commands still originate from the main tab, which is the pip window's opener. `opener` is on the cross-origin-readable Window property list, and the existing `parentOrigin` origin check still applies to every message, so this widens trust only to the window that opened the pip window: the same controlling document that embedded the iframe in the first place.

Protocol `version` stays 1: both fields are optional/additive, old hosts ignore `startTime` and old parents never hit the opener path.

### 4. Docs + release

- `demo/pages/providers.tsx`: scenes provider section documents PiP (Document PiP, Chromium desktop, capability-gated) and the pseudo-fullscreen fallback on iPhone-class browsers.
- Changeset: minor (`0.7.0`). "Scenes: Document picture-in-picture (Chromium desktop) and pseudo-fullscreen fallback for browsers without Element.requestFullscreen (iPhone Safari/Chrome)."
- PR only; Karn merges and publishes.

## Error handling

- `requestWindow` rejection (permission, no activation): swallow, state unchanged, button still shows PiP-off.
- Pip iframe reload failing auth (token expired mid-session): existing `kino:error` path surfaces it, same as any other reload; out of scope here (token re-mint is an existing backlog item).
- Play rejection after resume: host stays paused, no error surfaced.
- Pseudo-fullscreen restore always runs on destroy, guaranteeing no stuck scroll-lock.

## Testing

Vitest + jsdom, following existing scenes test conventions:

- `pseudo-fullscreen.test.ts`: styles applied, prior inline styles restored exactly, scroll lock on html+body applied/restored, restore idempotent.
- `provider.test.ts` additions:
  - fullscreen: wrapper without `requestFullscreen` gets pseudo treatment and `state.fullscreen` patches true/false; destroy restores; native path untouched when `requestFullscreen` exists.
  - PiP: fake `window.documentPictureInPicture` whose `requestWindow` resolves a stub window (own `document`, `addEventListener`, `close` dispatching `pagehide`). Assert: capability true only when the global exists; enterPiP moves the iframe and mounts placeholder + overlay; `kino:ready` after enter sends `kino:init` carrying `startTime` and `autoPlay` mirroring pre-enter state; pagehide moves the iframe back, patches `pip: false`, removes listeners; destroy while in PiP closes the window; `enterFullscreen` no-ops during PiP.
- `host.test.tsx` additions: init with `startTime` seeks the audio before play; init `startTime` clamps; play rejection does not throw; commands accepted from `window.parent.opener`; commands from unrelated windows still dropped.

Live verification after PR: desktop Chrome PiP via reins (trusted CDP click for the button), iPhone fullscreen on Karn's device against the demo or a deployed preview.

## Out of scope

- Mux/native provider fullscreen behavior on iPhone.
- Mobile PiP of any kind (impossible for DOM scenes today).
- MediaSession lockscreen controls / background audio (backlog).
- Token re-mint on expiry (existing backlog).
- Scenes-to-scenes `swapSource` interactions with PiP (single-sequence pilot; revisit with the second flagged sequence).

## Addendum (2026-07-21): muted mirror architecture

The shipped iframe-move design turned out to be activation-dependent. Moving the scene-sequence iframe into the pip window is a cross-document move, which reloads it, and the reloaded document's autoplay delegation comes from the pip window, which never has user activation. The audible resume play() is therefore rejected and playback comes back paused unless the origin's media-engagement score happens to be high. Reproduced live: after entering pip the audio sat paused at the correct resume time. Any design that reloads the host inside the pip window inherits this.

Replacement, provider-only (no protocol or host changes):

- The master iframe never moves. It stays mounted in the main tab, keeps playing, and remains the single source of truth for MediaState. The opaque inline placeholder covers it visually.
- enterPiP creates a second host instance in the pip window instead: a muted mirror iframe with the same src. On its kino:ready the provider sends kino:init with volume 0, muted true, autoPlay mirroring the master paused state, and startTime at the master clock. Muted autoplay is always allowed by policy, so the mirror starts without any activation.
- While pip is active, transport commands (play, pause, seek, setRate) fan out to the mirror alongside the master. setVolume and setMuted never do; the mirror stays muted forever.
- Drift correction: on each master state tick, when the mirror's last reported clock is more than 0.3s off the master's, the provider seeks the mirror to the master time.
- Exit removes the mirror and the pip surfaces; nothing resumes because the master never stopped. The resume capture path is gone from the provider.
- kino:init startTime stays in the protocol; the mirror init is now its consumer. The host opener source check also stays: commands to the mirror still originate from the main tab, which is the pip window opener.

The host clock element is a hidden video element rather than an audio element: Chrome's muted-autoplay exemption does not cover audio elements, so an audio-element clock could never start inside the pip mirror.
