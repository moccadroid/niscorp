---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config or its data handed a date op an impossible ISO date and relied on it rolling over: such input is now `E_DATE_INVALID`, and in a strata document step that stops the document's upgrade.

`$date`, `$dateAdd`, `$dateDiff` and `$localeDate` refuse an ISO date or time with a field out of range — `"2026-02-30"` (was March 2nd), `"2026-13-01"` (was 2027-01-01), `"2026-02-29"`, `"…T25:00"`, a minute or second of `60` — with `E_DATE_INVALID`, the error DOCS promises for a value that cannot be read as a date. `"…T24:00:00"` is still the next midnight, and every other value is read as before, with the same error codes.
