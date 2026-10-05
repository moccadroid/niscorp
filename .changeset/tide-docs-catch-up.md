---
"@niscorp/tide": patch
---

DOCS and DESIGN say what `catchUp: 'run'` does under `overlap: 'skip'`. Both are the defaults, and DOCS said `'run'` "fires every missed occurrence". It opens a run for each, and `overlap` is then asked of every one of them: occurrences missed together come due in one `advance` and are repeats of one another, so the oldest runs and each later one, the one that is on time included, is recorded `skipped` with an overlap note and a `run.skipped` event. The report's `skippedOccurrences` counts catch-up decisions and does not count those. `overlap: 'allow'` runs each missed occurrence (with `order: 'serial'`, one task at a time); `catchUp: 'latest'` runs only the newest. A test now holds this, and a source comment says it. No code changed.

**What to change:** nothing. A clock reflex on the default policy that should run every occurrence it missed says `overlap: 'allow'`.
