---
'@niscorp/tide': patch
---

DOCS.md states nine facts about the API that were written only in source comments.

They are: what `maxFanOut` counts and that a run over it is skipped; what a fact's `depth`, `deliveredAt` and `root` hold; what a task's `unit` and `claimedUntil` hold; what `appendIfAbsent` returns, that the store mints a missing `id`, and when a `UNIQUE_BY` key with `when` applies; and what `onePer` limits in a claim.

One statement is corrected. DESIGN.md said a run's cause can be a run id or `manual:<who>`. A run's `cause` is `occurrence:<key>` or `fact:<id>`; who fired a reflex by hand is the manual fact's `by`. DOCS.md now lists the forms of a run's and a fact's `cause`.

No behaviour changed.

**What to change:** nothing.
