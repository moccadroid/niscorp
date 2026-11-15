---
"@niscorp/nova": patch
---

`LayoutStore.resolveReferences` on a stored layout that refers to itself returns, leaving the inner `{ ref }` for the renderer, instead of overflowing the stack.

A canvas placed inside itself (a `CanvasSlot` naming the canvas it sits in) draws `RENDER_ERROR: canvas "<id>" is placed inside itself` where it comes back, in the TTY, DOM, React and Vue adapters, instead of overflowing the stack or running out of memory.
