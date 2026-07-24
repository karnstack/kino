---
"@karnstack/kino": patch
---

Scenes: hold every outgoing host command until the `kino:ready` handshake. A freshly created iframe holds an about:blank document that inherits the embedding page's origin until the host document loads, so a command posted at the host origin before then is refused by the browser ("The target origin provided ... does not match the recipient window's origin") and surfaces as a console error. `ScenesPlayer`'s mount-time `setSceneTheme` hit this on every cross-origin embed. Nothing is lost: the pre-ready rate, volume, muted and theme all ride the `kino:init` reply. The picture-in-picture mirror follows the same rule, gated on its own ready handshake.
