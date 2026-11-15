---
"@niscorp/cortex": patch
---

A run with `transport: 'step'` that is aborted during the model call now ends with `code: 'aborted'` instead of returning the model's answer, and the call is handed the run's abort signal.
