---
'@niscorp/vex': patch
---

`applyScope` is marked deprecated, and DESIGN.md describes the scope functions as they are.

The engine checks access with `checkScope` and places row rules with `scopeResolved`, after resolution. `applyScope` stayed as an exported function that runs the access check and returns the query as it came, while DESIGN.md still described it as merging the row filters into the query. It now carries `@deprecated` with that sentence, and the Scope section of DESIGN.md describes `checkScope` and `scopeResolved`.

No behaviour changed.

**What to change:** nothing has to. A caller of `applyScope` gets the same check from `checkScope(entities, policy)`. A caller that relied on `applyScope` to filter rows was not being filtered: it goes through the engine, or calls `scopeResolved` on the resolved query.
