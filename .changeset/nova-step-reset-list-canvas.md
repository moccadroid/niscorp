---
'@niscorp/nova': patch
---

Three fixes. `{ reset: 'path' }` run as a step — in a trigger, an `onSuccess`, a lifecycle hook — now restores the path's initial value; it set the path to `undefined`, because steps never handed the mutation the initial snapshot. The same omission kept strict mode out of steps: on a strict shell a `push`/`pop`/`removeAt`/`move`/`clear` at a missing or wrong-typed path now reports a `MutationError` to `onError` (exported from the package root) instead of doing nothing. `shell.addCanvas({ mode: 'list' })` is a list canvas; `mode` was read only from `createShell`'s `canvases`. And an instance covered while its `mount` hook is still running stays suspended — `mount` set it back to `active` when the hook finished, leaving two active instances on a stack.
