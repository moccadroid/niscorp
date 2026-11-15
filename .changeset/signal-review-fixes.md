---
"@niscorp/signal": patch
---

An `AbortSignal` now aborts every call: the one set with `.options({ signal })` is read by `complete()`, `stream()`, `step()`, `stepStream()`, `embed()` and `decide()`, and `step()` takes `{ signal }` as its second argument. An aborted `stream()` ends without a `done` event instead of throwing "stream ended without a done event"; `complete()`, `step()`, `embed()` and `decide()` reject with `E_PROVIDER_ERROR`, and a call aborted before it starts sends nothing.
