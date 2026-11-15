---
"@niscorp/strata": patch
---

`strata verify` fails, and leaves the lock where it is, when an edited artifact matches its migrated JSON but does not pass its kind's current schema.

`strata upgrade` and `strata verify` remove only the files a plan wrote (`plan.json`, `REPORT.md`, `expected/`), and a directory only once it is empty: a `workDir` that is the project itself, or lies outside it, no longer has its contents deleted, and `verify` keeps anything else in `.strata`.

A stamp entry that is not a number (a lock's `"x"`, a stored row's `"one"`) is refused with `STEP_FAILED` instead of passing as current: `strata status` fails on such a lock, and `upgradeStore` refuses the pass.

The README says what to do when a migration renames the key a kind is embedded under: keep the old path in `embeds` beside the new one.
