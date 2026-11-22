---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app builds a component list from the DOM or TTY kit's `registry.list()` and expects it without `CanvasSlot`.

The DOM and TTY kits' `defaultRegistry()` register `CanvasSlot`, so either kit works as the shell's registry, as the README shows: the default shell layout draws instead of `COMPONENT_NOT_FOUND: CanvasSlot`. Their walkers still draw a `CanvasSlot` themselves; the entry is there so the renderer accepts the name, as in the React and Vue kits. `registry.list()` of these two kits names one more component.
