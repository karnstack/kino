---
"@karnstack/kino": minor
---

The scene clock now keeps running through the silence gap after a scene's narration, up to the scene's `end`. Before, it stopped at the end of the narration, so a looping animation (data moving between two boxes) froze for the length of the gap. Cue progress already stops at its end value, so cue-driven state looks the same as before. A scene that reads the raw time and does not stop it at `duration` now sees values past `duration` during the gap.
