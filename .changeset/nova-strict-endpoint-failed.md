---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app runs its shell with `strict: true` and does not want `onError` called for failed calls nothing takes. Lax shells (the default) are unchanged. The exported `ErrorCode` type gains `'ENDPOINT_FAILED'`.

In strict mode, a `call` outside a lifecycle hook that fails with no `onError` steps and no `errorTarget`, or names an endpoint the action does not have with no `onError` steps, is reported to the shell's `onError` as a `NovaError` with the new code `ENDPOINT_FAILED` (`ErrorCodes.endpointFailed`). Nothing is thrown that was not thrown before; an unknown function still raises `UnknownFunctionError` in strict mode, and a lifecycle hook still raises `LifecycleError`.

The report never changes what runs: an `onError` that throws for it does not stop the step, the push or the next handler.
