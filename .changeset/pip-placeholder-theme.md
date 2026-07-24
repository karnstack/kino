---
"@karnstack/kino": patch
---

The picture-in-picture placeholder (the layer left inline while playback runs in the pip window) now follows `chromeTheme` instead of always painting a solid black void. Its colors move to `--kino-pip-fill`, `--kino-pip-card`, `--kino-pip-card-border`, `--kino-pip-text`, `--kino-pip-text-hover`, and `--kino-pip-sub`, which the `data-kino-theme="light"` block overrides, and the "playing in picture in picture" affordance sits in a small card so it reads on a light surface. Dark is unchanged; `--kino-pip-fill` must stay opaque because the master media keeps playing underneath it.
