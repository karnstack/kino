---
"@karnstack/kino": patch
---

Mux and native: a destroyed provider leaves nothing playing. `destroy()` removed its listeners and detached the element, but detaching a media element does not stop it. A removed `<mux-video>` keeps playing and keeps pulling HLS segments, and nothing on the page can reach it any more, because every control talks to the provider that owned it. React invokes a mount effect twice in development, so a player created with `autoPlay` would mount, tear down and mount again, and the discarded element played on underneath the live one, a beat apart, until the tab closed. The same thing happened to any player that was already playing when a route change, a remount on a changed `key` or a fast refresh tore it down. A source change is not one of these: it flows through `swapSource`, which keeps the element and never calls `destroy()`.

Both providers now pause the element and drop its source before removing it. For mux that means clearing the `src` attribute, which is what makes `mux-video` tear its playback engine down; the element's own `disconnectedCallback` cannot cover this, because `mux-video` finishes its setup a microtask after mount and a mount and teardown that land in the same tick get there first. The native provider already released its source, and now pauses as well, so its stop no longer rides entirely on `load()`.

The YouTube, Vimeo and scenes providers were already clean. The first two hand teardown to the SDK's own `destroy()`, which takes the player iframe with it, and scenes removes the host iframe, which discards the document and the audio element inside it. A detached iframe stops. A detached media element does not.
