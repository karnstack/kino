---
"@karnstack/kino": minor
---

Add a scenes entry (`@karnstack/kino/scenes`): audio-driven React scene sequences.
On the parent side, `createScenesProvider` and `ScenesPlayer` run scene iframes
under kino's chrome; inside the iframe, `createSceneHost` and `useSceneTimeline`
sync visuals to the audio clock over a postMessage wire protocol. Captions ship
as sidecar VTT.
