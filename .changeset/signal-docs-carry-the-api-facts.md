---
'@niscorp/signal': patch
---

DOCS.md states thirty-nine facts about the API that were written only in source comments, and describes `resolveTransport`.

`step()` and `stepStream()` now have their request and result fields described: the shape of a tool-calling transcript, `output.accept` and `output.outputTool`, what `toolCalls[].args` holds, what `usage.reported: false` means, `outcome`, `wire.rung` and `wire.recovered`, and the `reasoning` and `tool_call_delta` events. A new subsection gives `resolveTransport(spec, capabilities)`: every field of the spec and of the result. Also added: what `UNMEASURED_MODEL` assumes, `chatProviderEntry`, that `describe()` makes no request, that an OpenRouter row lists what the proxy accepts, and that `jev-latest` is an alias.

No behaviour changed.

**What to change:** nothing.
