---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app relied on a mount hook's navigation acting from the instance below, on `getCanvasState` leaving out an instance whose mount hook is running, or on the first state snapshot after a push leaving it out.

A pushed (or replacing) instance is on its canvas, with its birth, origin and key recorded, before its `mount` hook starts. A `push`, `pop` or `removeSelf` step that runs at the start of a mount hook now acts from that instance: `push` lands above it, `removeSelf` and `pop` close it. A mount hook that pushes onto another canvas fires a first state snapshot that already shows the new instance on its own canvas.

A `suspend` whose hook finishes after the action was revealed again (a push and a pop before the suspend ended) or removed no longer sets `suspended`: the action on top stays `active` and its triggers fire.
