---
"@karnstack/kino": minor
---

Scenes: light/dark stage theming over the wire. kino:init gains an optional
theme and a new kino:setTheme command follows the embedding site's live theme
toggle without reloading the iframe. ScenesPlayer takes sceneTheme (distinct
from theme, which styles kino's chrome), createScenesProvider takes theme and
returns ScenesProvider with setSceneTheme, and the host applies the theme to
documentElement as exactly one of dark/light plus the matching colorScheme.
The pip mirror inits with the current theme and follows flips alongside the
master. Dark stays canonical: omit everything and existing hosts behave
exactly as before.
