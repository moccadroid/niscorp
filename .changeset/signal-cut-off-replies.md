---
"@niscorp/signal": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a Groq tool call that was cut off inside its arguments being run with the arguments closed.

A result now says how the provider ended the reply. `meta.finishReason` on `complete()` and `stream()` is the last reply's finish reason (`stop`, `length`, `content_filter`, …). A `step()` or `stepStream()` result whose output was rescued from a reply the provider cut off (`length` or `content_filter`) while its JSON was still open carries `wire.truncated: true`: `{"items":["alpha","beta","gam` gives `{ items: ["alpha","beta"] }` as before, now marked.

An output rescued from an attempt a provider's rejection carried cut short (a Groq `failed_generation` with its JSON open, from `json_validate_failed` or a call to the exit tool) is marked `wire.truncated` too. `meta.finishReason` is `error_recovered` when the last reply was recovered from a rejection: that value is signal's, not a provider's.

`refuseCutOff: true` (on `createSignal`, or `output.refuseCutOff` on a `step()` request) turns such a reply, or such an attempt, into a failed attempt with `truncated: true` and the evidence `the reply was cut off (finish reason "length") before its JSON closed. It began: …`, so `complete()` retries it. A reply that ended with `stop`, or whose JSON closed before the cut, is never refused. Without the option nothing changes.

A tool call recovered from a Groq rejection (`failed_generation`) that was cut off inside its arguments is no longer run with the arguments closed: `{"name":"transfer","arguments":{"to":"acct-1","amount":10` (the model was writing 1000) ran `transfer` with 10. Its arguments now go on as the text they are, the tool's input check fails, and the model is told `input_invalid` and calls again. A rejected call whose arguments are whole runs as before: one missing only its outer `}`, or cut in a key or value after its arguments (`…"amount":1000},"id":"call_1`).
