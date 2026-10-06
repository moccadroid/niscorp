---
"@niscorp/strata": patch
---

`migrate` takes a `guard` and a `dryRun`.

A host could run a table migration and could not ask anything of the result before it landed, or see what a run would do without doing it.

`guard(tx)` is asked inside the run's transaction, after the last pending step — when nothing was pending too. Every sentence it returns refuses the run with `DOES_NOT_FIT`, and nothing was applied. `dryRun` does all of it, guard included, then rolls it back: the report says what would be applied, and it takes the locks a real run takes.

**What to change:** nothing. A run given neither behaves exactly as before. `StrataErrorCode` gains one member, `DOES_NOT_FIT`.
