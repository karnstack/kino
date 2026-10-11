---
"@karnstack/kino": patch
---

Scenes: a paused seek into a scene that is still preloading now draws it when the load lands. Stage preloads the next scene with no callback, so when a seek (often a `?t=` deep link) landed in that scene before its preload finished, the redraw callback for the current scene was dropped because the id was already pending. Paused, nothing else re-renders the stage, so it stayed empty until the next play or seek. Every caller of a pending scene now joins its waiters and each one runs when the load resolves. The `timeupdate` workaround around `loadScene` can be removed.
