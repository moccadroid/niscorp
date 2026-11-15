---
"@niscorp/cortex": patch
---

A run with `transport: 'step'` that is aborted during the model call now ends with `code: 'aborted'` instead of returning the model's answer, and the call is handed the run's abort signal.

Two readers iterating `run.events` at the same time (for example the manifold's `onRun` tracer and the app's own loop) now both get every event and both end; before, one of them could wait forever.

An approval answered (or a run aborted) before `policy.approvalTimeoutMs` runs out no longer leaves its timer running, so a process does not stay alive until the timeout.

A correction sent back to the model quotes the issues word for word: `$$`, `$&` and `$'` in them were rewritten before.

The README's quick example no longer runs model-written text with `new Function`, and the docs say that a model swapped in by `prepareStep` is sent the output strategy resolved for the run's own `llm`.

A tool that takes no arguments now runs when its call arrives with no argument text, instead of failing with "arguments arrived as ONE STRING".
