---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app computes a negative `removeAt` index on purpose and does not want `onError` called for it; the data changes exactly as before.

A `removeAt` step whose `index` is a template that resolves to a negative number (`index: '{{$.found}}'` with `found = -1`, a search's "not found") is reported to `onError` as a `NovaError` with code `MUTATION_ERROR` (`removeAt: index {{$.found}} resolved to -1, …`), in strict and lax mode, and then applied as before: `-1` still removes the last element. A literal negative `index` is a deliberate "from the end" and is not reported.

The report never changes what runs: an `onError` that throws for it does not stop the step, the push or the next handler.
