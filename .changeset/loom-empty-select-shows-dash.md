---
"@niscorp/loom": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host relied on the built-in select displaying its first option for an enum with no value (a test that reads the select's value, say); documents do not change.

A select whose value is none of its options shows a disabled "—" row, where it displayed the first option although the document had no value; choosing that first option then wrote nothing, as it was no change. Every real option is now a change and is written. The README note "A select has no row for "none"" is gone.
