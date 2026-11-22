---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `errorTarget.data` (or `@error.data`) being missing for a failed HTTP reply whose body is plain text. The message is unchanged. `FetchResponse` gains an optional `clone`.

A failed HTTP reply whose body is not JSON (`new Response('Service down for maintenance', { status: 503 })`) puts that text in `errorTarget.data` and `@error.data`, where `data` was missing: nova takes a copy of the response with `clone()` before reading it as JSON. A response without `clone` (a test fake), or one whose body the host already read, is read as before.
