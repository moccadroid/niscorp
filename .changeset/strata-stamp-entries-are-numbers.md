---
"@niscorp/strata": patch
---

BREAKING (pending consolidation): nothing unless an app stores documents whose stamp has an entry, for a grammar it upgrades, that is not a number (`{ "acme.kit": "v0" }`), or keeps stamps in a column that is not jsonb. `upgrader.upgrade` and `upgrader.behind` now throw `INVALID_SEQUENCE` for such an entry, where `upgrade` returned the document unmigrated and stamped current; `upgradeStore` leaves such rows as they are and names them in a new `unread` list on its report, where it skipped them silently (jsonb) or ran every migration over them again (a `text` column).

A stamp entry is read with `Number`, as the comparisons always read it, so digits in a string and `null` read as before. An entry for a grammar the upgrader was given that reads as no number is refused with `INVALID_SEQUENCE`, naming the grammar and the entry.

`upgradeStore` still locks every row in one transaction, but reads only the keys and stamps under the lock, and then each behind row's document by its key, one at a time: a store whose rows are all current loads no document. A row it cannot read — a stamp that is neither null nor a JSON object, an entry for a given grammar that is no number, or a key the driver does not hand back exactly as stored (a `timestamptz` with microseconds) — is left as it is and named in `StoreReport.unread` (`id="e"`), present only when there is one; the pass goes on. `total` is still every row of the table.
