---
"@niscorp/strata": patch
---

`strata verify` fails, and leaves the lock where it is, when an edited artifact matches its migrated JSON but does not pass its kind's current schema.

`strata upgrade` and `strata verify` remove only the files a plan wrote (`plan.json`, `REPORT.md`, `expected/`), and a directory only once it is empty: a `workDir` that is the project itself, or lies outside it, no longer has its contents deleted, and `verify` keeps anything else in `.strata`.

The README says what to do when a migration renames the key a kind is embedded under: keep the old path in `embeds` beside the new one.

`strata.lock.json` is refused (`INVALID_SEQUENCE`, as for a lock that is not an object) when a grammar's entry is not a whole number of migrations, written as a number or as digits: `"x"`, `""`, `-1`, `null`, `true` and `1.5` no longer pass as current or re-run migrations.
