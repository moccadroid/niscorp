---
"@niscorp/prism": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: a config that builds a date from parts and can make an impossible one must change before it upgrades: such input is now `E_DATE_INVALID` (in a strata document step that stops the document's upgrade). A next-birthday entry that joins this year to a 29 February birthday fails on every day of a common year, and inside a `$map` that fails the whole list for everyone; use 28 February or 1 March when the year is not a leap year.

`$date`, `$dateAdd`, `$dateDiff` and `$localeDate` refuse an ISO date or time with a field out of range — `"2026-02-30"` (was March 2nd), `"2026-13-01"` (was 2027-01-01), `"2026-02-29"`, `"…T25:00"`, a minute or second of `60` — with `E_DATE_INVALID`, the error DOCS promises for a value that cannot be read as a date. `"…T24:00:00"` is still the next midnight, and every other value is read as before, with the same error codes.
