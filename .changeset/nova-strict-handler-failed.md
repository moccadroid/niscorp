---
"@niscorp/nova": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app runs its shell with `strict: true` and does not want `onError` called for subscribers that throw. Lax shells (the default) and buses an app hands in are unchanged. The exported `ErrorCode` type gains `'HANDLER_FAILED'`.

In a strict shell, a subscriber that throws is reported to the shell's `onError` as a `NovaError` with the new code `HANDLER_FAILED` (`ErrorCodes.handlerFailed`) and the thrown message: `onStateChange`, `onDataChange` and `onEndpoint` listeners, handlers on the event and message bus the shell created itself, and each runtime's data and status subscribers. The throw is still caught, and the other handlers and the push or write that fired them go on.

The report never changes what runs: an `onError` that throws for it does not stop the step, the push or the next handler.
