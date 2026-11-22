---
"@niscorp/strata": patch
---

BREAKING (pending consolidation): nothing unless an app runs `strata upgrade` with a `workDir` that already holds a `REPORT.md` or `plan.json` of its own (upgrade now exits 1 and leaves it, where it replaced and later deleted it), or relied on `strata verify` accepting a `plan.json` whose `from` differs from the committed `strata.lock.json` (it now refuses: plan again).

In a `workDir` the host names, strata treats a `REPORT.md` as its own only when it begins with `# strata upgrade` (a byte-order mark aside), and a `plan.json` only when it has a plan's shape. Given one that is not, `upgrade` leaves it as it is and exits 1 with "… is not one strata wrote — it is left as it is. Move it, or give strata a workDir of its own.", and `upgrade` and `verify` never remove it. In the default `.strata/upgrade`, which is strata's own, its files are replaced as before.

`verify` refuses a plan made from a lock other than the committed one, and so checks the untouched artifacts from the lock: an edited `plan.json` can no longer move the lock with the source never migrated. It compares stamps grammar by grammar, so grammars given in another order no longer refuse a valid plan. Two artifact ids that clean to one file name (`a/b`, `a_b`) each get an expected file of their own (`a_b.json`, `a_b~2.json`), where the second overwrote the first.
