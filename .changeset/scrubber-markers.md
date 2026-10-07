---
"@karnstack/kino": minor
---

Timeline markers. `Player` and `ScenesPlayer` take `markers` (`{ id, time, color?, label? }[]`) and `onMarkerClick`. Each marker is a small dot on the scrubber, in desktop and compact layouts. Hovering one shows its label in the scrub preview; clicking one calls `onMarkerClick` with its id and does not seek. Markers outside the media's duration are skipped. Omit `markers` and nothing changes: the scrubber renders exactly as before.
