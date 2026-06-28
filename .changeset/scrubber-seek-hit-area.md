---
"@karnstack/kino": patch
---

Fix scrubber seek hit area. The hover preview rendered across the full scrubber height (its `8px` vertical padding), but `pointerdown`/seek was bound only to the thin `.kino-track` line (4–6px). Clicking anywhere the preview showed — but off the line — did nothing. Seek now binds to the whole scrubber, so clicking anywhere the preview appears seeks. Time mapping still derives from the track rect (padding is vertical only, so the horizontal extent is unchanged).
