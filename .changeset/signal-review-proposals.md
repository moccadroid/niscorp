---
"@niscorp/signal": patch
---

An abort now ends `stream()`, `stepStream()` and `complete()` at once while the provider's SDK waits out a rate limit's `retry-after`; before, they ended only when that wait was over. `step()`, `embed()` and `decide()` still wait it out.

`step()` now returns `reasoning` when the provider sends the model's thinking in a non-streaming reply (`message.reasoning` or `message.reasoning_content`) without being asked. The request is unchanged.
