---
'@niscorp/nova': minor
---

`chainCycles(definitions)` in `@niscorp/nova/reflect`: the chains of steps that never end, found in the definitions — a trigger that re-emits its own channel, triggers answering each other, a mount that reloads itself, a mount whose emit reaches a trigger that pushes it again. Steps have no conditionals, so a cycle here always runs; one is reported per tangle, with its path.
