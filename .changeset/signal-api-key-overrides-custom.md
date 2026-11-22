---
"@niscorp/signal": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app calls `.apiKey(k)` on a custom provider that has its own `apiKey` and relied on the provider's key being sent.

`.apiKey(k)` now overrides the key of a custom provider that has its own `apiKey`, as DOCS says: `createSignal({ baseUrl, apiKey: 'provider-key', model }).apiKey('override-key')` sent `Bearer provider-key` and now sends `Bearer override-key`. `createSignal(custom, { apiKey })` keeps its order: the provider's own key is sent when it has one.
