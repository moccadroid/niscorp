---
"@niscorp/signal": patch
---

An abort now ends `stream()`, `stepStream()` and `complete()` at once while the provider's SDK waits out a rate limit's `retry-after`; before, they ended only when that wait was over. `step()`, `embed()` and `decide()` still wait it out.
