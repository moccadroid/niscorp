---
"@niscorp/nova": patch
---

`LayoutStore.resolveReferences` on a stored layout that refers to itself returns, leaving the inner `{ ref }` for the renderer, instead of overflowing the stack.
