---
"@niscorp/signal": patch
---

An abort now ends `stream()`, `stepStream()` and `complete()` at once while the provider's SDK waits out a rate limit's `retry-after`; before, they ended only when that wait was over. `step()`, `embed()` and `decide()` still wait it out.

`step()` now returns `reasoning` when the provider sends the model's thinking in a non-streaming reply (`message.reasoning` or `message.reasoning_content`) without being asked. The request is unchanged.

A custom provider naming an unknown `wire` strategy id now throws a `SignalError` with code `E_VALIDATION_FAILED` and `context.wire`, with the same message; before, it was a plain `Error`.

DOCS says which value answers when an OpenAI reply holds several JSON values: the first that passes the schema.
