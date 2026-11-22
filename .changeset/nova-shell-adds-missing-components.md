---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app hands `NovaShell` or `NovaCanvas` a registry with no `CanvasSlot` and relied on React's `Text`, `Stack`, `Input`, `Button`, `Box`, `Panel`, `JsonTree` or `ActionSlot` replacing its own.

`NovaShell` and `NovaCanvas`, handed a registry with no `CanvasSlot`, add only the default React components the registry does not have, and replace none it has. The Ink kit's registry keeps Ink's `Text` and gets `CanvasSlot`. A registry that has `CanvasSlot` is untouched, as before.
