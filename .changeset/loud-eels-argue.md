---
"@karnstack/kino": minor
---

Scenes: the ambient preview now loops at 2x by default, and `preview` takes an optional `rate` to override it. Scenes compute everything from the sequence clock rather than wall time (the render path drives them under a fake clock, so wall-time CSS transitions would not survive it), which means the whole stage scales cleanly with the rate instead of desyncing. The faster pass reads livelier and covers the window in half the time, so the player settles sooner. The loop's rate is its own either way: the viewer's rate is restored when they take the clock back, and a rate that would stall the clock falls back to the default rather than letting the grace timer mistake a frozen loop for refused autoplay.
