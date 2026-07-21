---
"@karnstack/kino": minor
---

Scenes: document picture-in-picture (Chromium desktop, capability-gated via canPiP) and a pseudo-fullscreen fallback for browsers without Element.requestFullscreen (iPhone Safari and Chrome). kino:init gains an optional startTime, used to start the muted pip mirror at the master clock so playback continues seamlessly without interrupting the main tab; the host also accepts commands from the pip window's opener.
