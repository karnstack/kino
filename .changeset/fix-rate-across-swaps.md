---
"@karnstack/kino": patch
---

Actually fix playback-rate persistence across source swaps. The previous attempt set `defaultPlaybackRate`, but mux-video does not proxy that property to its inner `<video>`, so loading a new source still reset the rate to 1x. kino now tracks the chosen rate (`desiredRate`) and re-asserts it on the element after every source load, and reports it as `state.rate` so the brief reset never surfaces to the UI.
