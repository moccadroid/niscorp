---
'@niscorp/nova': patch
---

A canvas can be reconciled by a function the app hands the shell. `ShellConfig.reconcilers` names them; a canvas's `reconcile` names the one that reconciles it, whenever a `reconcile` step aims at it. A canvas that names none is reconciled exactly as before. A `Reconciler` is called as `reconcileCanvas` is, and its options also carry `moveInstance(canvasId, instanceId, index)` — a move that re-mounts nothing and writes nothing to the navigation journal — and `keyOf(instanceId)`, the `key` an instance was pushed with (`PushOptions.key`, new). Each entry a `reconcile` step hands over carries its `row` as written (`Desired.row`), so a reconciler can match rows by a field of its own choosing — several instances of one action on one canvas, in the list's order. A canvas naming a reconciler the shell was not given is refused by `createShell` and `addCanvas`. No grammar change: the step's schema is as it was.
