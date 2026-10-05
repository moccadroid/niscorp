---
"@niscorp/tide": patch
---

A run settles when its last tasks land at the same moment.

Recording an attempt read the run, decided whether it was complete, and then wrote the count. Two landings at once — two instances on one store, or two overlapping `advance` calls — each read the run before the other's count was in; neither settled it, and it stayed `fanned` with every task `done`. No run fact was minted, and a reflex with `overlap: 'skip'` recorded every later firing as skipped.

The count is now written first and the run read after it, and the run is settled by a `cas` from `fanned`, so it settles once. Nothing in the store contract changes: it uses `cas` and `query` as they are.

**What to change:** nothing.
