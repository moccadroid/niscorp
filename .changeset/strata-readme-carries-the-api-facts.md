---
'@niscorp/strata': patch
---

The README states what its API tables left to source comments.

It now gives the grammar of a sequence id and of a kind name, what `planMigrations` and `migrate` return, the refusals that had no name in the docs (`PENDING`, `STEP_FAILED`, `WRONG_OWNER` from `migrate`, `UNKNOWN_KIND`, a duplicate sequence id), what `upgrader.upgrade`, `upgrader.locate` and `upgradeStore` take and return, and rows for `refuseProblems` and `diffJson`.

No behaviour changed.

**What to change:** nothing.
