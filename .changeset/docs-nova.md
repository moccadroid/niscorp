---
"@niscorp/nova": patch
---

DESIGN.md says how `useCanvas` and `useRenderTree` cache: `useCanvas` keeps the state `onCanvasChange` hands it (the shell compares states with `sameCanvasState`), and `useRenderTree` compares the shell's phrases as well as its data.

**What to change:** nothing. Documentation only.
