---
"@niscorp/nova": patch
---

BREAKING (pending consolidation): nothing unless an app reads `model.ref` from the render tree of a model-bound field that has its own `ref` inside a loop, and expects it to equal that `ref`; dispatching `ui:model` with the render tree's `model.ref`, as every kit does, keeps working.

A model-bound field with a `ref` inside a loop (`for: '$.lines', as: 'line', do: { component: 'Input', ref: 'qty', model: '$line.qty' }`) writes what is typed into its own row, where every row wrote the last one. Its render node's `model.ref` is `qty@lines.0.qty` (one per row, the same however many rows there are); its `ref` stays `qty`. Triggers on `ref: 'qty'` fire for every row and see `@event.ref` as `qty`, and a `ui:model` an app dispatches with `ref: 'qty'` still writes the last row. The longer name shows wherever a model ref is shown: adapters, devtools, the TTY command list, and the render trees moss sends to terminals.
