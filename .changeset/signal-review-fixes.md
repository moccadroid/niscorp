---
"@niscorp/signal": patch
---

An `AbortSignal` now aborts every call: the one set with `.options({ signal })` is read by `complete()`, `stream()`, `step()`, `stepStream()`, `embed()` and `decide()`, and `step()` takes `{ signal }` as its second argument. An aborted `stream()` ends without a `done` event instead of throwing "stream ended without a done event"; `complete()`, `step()`, `embed()` and `decide()` reject with `E_PROVIDER_ERROR`, and a call aborted before it starts sends nothing.

A tool that takes no arguments now runs in `complete()` and `stream()` when the provider sends its call with no argument text, instead of failing its input check.

A tool call recovered from a provider's rejection gets a short random id instead of `recovered_<n>` from a counter that started again in every process, so a resumed conversation no longer repeats an id.
