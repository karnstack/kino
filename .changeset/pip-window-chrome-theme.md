---
"@karnstack/kino": minor
---

`chromeTheme` now reaches the picture-in-picture window, not just the main tab. `createScenesProvider` takes a `chromeTheme` option and `ScenesProvider` gains `setChromeTheme`, which `ScenesPlayer` wires to its existing `chromeTheme` prop, so a theme flip mid-playback restyles an open pip window instead of leaving dark controls over a light stage. The overlay drawn on the pip window (which never loads `kino.css`) carries its own token sheet, dark by default with a light block keyed on `data-kino-theme`, and the pip window's backdrop follows `sceneTheme` rather than painting a hardcoded black behind a light stage. Omit both and nothing changes.
