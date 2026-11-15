---
"@niscorp/cortex": patch
---

A run with `transport: 'step'` that is aborted during the model call now ends with `code: 'aborted'` instead of returning the model's answer, and the call is handed the run's abort signal.

Two readers iterating `run.events` at the same time (for example the manifold's `onRun` tracer and the app's own loop) now both get every event and both end; before, one of them could wait forever.
