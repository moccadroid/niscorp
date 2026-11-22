---
"@niscorp/cortex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app has an `onToolResult` hook that does not check `observation.kind` and relied on it running for successful calls only.

`onToolResult` hooks now run after every executed tool call, also when the tool threw or passed its time limit; before, they ran only when it returned. On an `error` observation a hook's `{ result }` replaces the error text that goes to the model and to `tool-end`: a tool that throws `connect failed: postgres://admin:hunter2@…` reached the model as written, and with a redacting hook `(o) => ({ result: '[redacted]' })` it now reaches it as `error: [redacted]`. A hook that throws makes the call an error carrying the hook's message, as for a result. A hook that returns early unless `observation.kind === 'result'` sees no difference. Hooks still do not run for a denied call, an unknown tool, or arguments that failed the input check.
