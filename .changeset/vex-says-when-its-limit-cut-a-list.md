---
"@niscorp/vex": patch
---

The reply says when the engine's own limit may have cut a list.

A list query that states no `limit` is given `defaultLimit` (100), and a generated one asking for more than `maxLimit` is clamped. Either way the reply carried the rows and nothing else: a list of 100 looked like a list that had 100 things in it.

When the `LIMIT` a query ran with was the engine's number — the default, or the maximum — and exactly that many rows came back for a list, `meta.warnings` now carries one line saying the list may have been cut and which number did it. For a request that named a fingerprint the same line is written once per fingerprint with `console.warn`, because a host that hands callers `result` without `meta` would show it to no one.

It says "may": no extra row is fetched to find out, so a list of exactly that many rows gets the line too. A list that ended on a `limit` its author stated gets none, and neither does a single-row answer. No `result` changes, and no query reads a different number of rows.

**What to change:** nothing. If the line appears for one of your entries, state the `limit` that list should have.
