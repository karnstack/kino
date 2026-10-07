---
"@karnstack/kino": patch
---

Scenes: stop using CPU when nobody can see the player. When the player is scrolled out of view or the tab is hidden, the muted preview loop pauses and the stage stops drawing frames. Real playback keeps playing, and the stage catches up when it is visible again. The stage also no longer runs a frame loop while paused. Turn this off with the new `pauseWhenHidden={false}` option.
