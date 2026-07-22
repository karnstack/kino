---
"@karnstack/kino": patch
---

The `.kino` root backdrop is now a `--kino-bg` token (default `black`), so a
host embedding the player over a light page can theme it (e.g. `--kino-bg:
transparent`) instead of flashing black before the media paints. Default is
unchanged, so existing players stay black.
