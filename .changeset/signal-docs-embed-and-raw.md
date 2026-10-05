---
"@niscorp/signal": patch
---

DOCS.md says what `embed()` and `meta.provider.raw` do. `embed()` does not check `supportsEmbedding`: the flag is what `describe()` reports, and the request is sent either way; a refused request is `E_PROVIDER_ERROR` with the provider's own error under `context.raw`. `meta.provider.raw` is `null` after `complete()` and `stream()`, which read the reply as a stream and keep no body (`step()` returns the body), and it is the provider's error for a call Signal recovered from a rejection. No code changed.

**What to change:** nothing.
