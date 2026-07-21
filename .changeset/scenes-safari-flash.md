---
"@karnstack/kino": patch
---

Scenes: fix the visible flash on every scene transition in Safari. WebKit
presents a freshly created compositing layer before its content paints (WebKit
bug 270330), so the keyed remount at each boundary flashed. Two changes address
it: the never-unmounting stage div now pins a persistent compositing layer
(translateZ(0) plus willChange, backfaceVisibility, and isolation) so child
scene swaps paint into an already-promoted backing store instead of triggering
first-show layer creation; and on a natural advance the outgoing scene is held
over the incoming one for 240ms so its settled final frame covers any
not-yet-painted first frame. The held scene is reordered rather than remounted,
so its kino:scenechange still fires exactly once, and the hold is skipped on far
seeks, scrubs, and when playback pauses.
