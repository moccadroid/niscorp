---
"@niscorp/tide": patch
---

DOCS.md says which occurrence `preview()` shows and what `fired` means. For a clock reflex it is the most recent occurrence at or before `now` (a one-shot's own date, even when that is still ahead), whether or not the reflex was armed then or is enabled now, so an `advance` at the same `now` may create no run. `fired: false` means `when` did not match the fact passed in or the fan-out failed; `fired: true` does not say a run is due. No code changed.

**What to change:** nothing.
