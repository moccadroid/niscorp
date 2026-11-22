---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config runs `$min` or `$max` over about 111,000 items or more under the default `maxSteps`, or relies on a stored compiled fingerprint of a config that uses them: each item now costs 9 steps instead of 8, and the desugared form, so the fingerprint, changes once.

`$min` and `$max` skip a `null` item wherever it is in the list. `[3, null, 1]` gave `E_TYPE` while `[null, 3, 1]` gave `1`; both now give `1`, and a list of nulls gives `null`. Every list that had an answer has the same answer.
