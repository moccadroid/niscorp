---
"@niscorp/cortex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: a tool or delegated agent that hands `ctx.signal` to work meant to outlive its time limit sets a longer `timeoutMs`, or gives that work a signal of its own.

A tool call that passes its time limit (`timeoutMs`) now has its `ctx.signal` aborted, with an `AbortError` as when the run is aborted. A tool that hands `ctx.signal` to its work stops there, instead of running on after the model was told it timed out: a `send_email` that timed out and was called again sent the email twice before, and sends it once now. A tool that ignores `ctx.signal` runs on as before.

A delegated agent (`asTool`, `manifold.asTool`) runs on the delegating call's signal, so it now stops at the delegation's time limit instead of finishing after the parent has moved on.

Each tool call gets its own `ctx.signal`. It aborts with the run while the call runs; once the call has ended, a later abort of the run no longer reaches it. Gates and `onToolResult` hooks are still handed the run's signal.
