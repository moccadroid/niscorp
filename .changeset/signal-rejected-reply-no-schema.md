---
"@niscorp/signal": patch
---

BREAKING (pending consolidation): nothing unless an app relied on `complete()` or `stream()` without a schema answering `''` when the provider rejected the reply.

`complete()` and `stream()` without a schema now reject with `E_PROVIDER_ERROR` (`Provider rejected the reply: …`, the provider's error in `context.raw`) when the provider rejected the reply and nothing could be recovered from it. A Groq `tool_use_failed` for a call to a tool that was not declared resolved with `response: ''` as if the model had answered; it now throws, as the same call throws on a provider without the `failed-generation` strategy. With a schema nothing changes: such a reply is retried as before. A rejected call to a declared tool is still recovered and run.
