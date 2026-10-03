# @niscorp/nova

## 0.1.2

### Patch Changes

- 633d0d1: The DOM adapter (`@niscorp/nova/adapters/dom`) keeps what did not change. `createDomView` used to empty its root and build the whole screen again on every render; it now keeps the tree it drew beside the DOM that tree produced and patches the page, so an element whose part of the tree is the same as before is the same DOM node, never taken off the page. Focus, scroll, a selection, an open `<details>`, a running animation and a timer a component started are kept, and one changed string costs one text node. A change in one instance or on one canvas leaves the others alone; keyed lists move their elements; a different instance in the same place is still all new. The first render still replaces markup drawn ahead of time, and now gives somebody already typing in it their words, caret and focus back by where the field sits rather than by its `ref`.

  Fixed with it: typing in the second of two instances that share a `ref` moved focus (and the next keystroke) to the first; a bound field with no `ref` of its own lost focus after one keystroke; a pressed button lost focus to `<body>`; `debounce` did not coalesce across a render, and a pending value was not sent on blur.

  A DOM kit keeps working unchanged if its components are functions of their props and children. `DomComponentContext` gains two things: `onRemove(cleanup)`, run once when the element leaves the page for good, and `dependsOnChildren()`, for a component that marks or counts the children it holds. What a kit should check is in ADAPTER.md, "The DOM adapter keeps what did not change": a component is no longer called because something else on the page changed, children are patched in place only under an element that holds exactly them, and data that changes often should arrive as children rather than as a prop.

- 45d6731: Three fixes. `{ reset: 'path' }` run as a step — in a trigger, an `onSuccess`, a lifecycle hook — now restores the path's initial value; it set the path to `undefined`, because steps never handed the mutation the initial snapshot. The same omission kept strict mode out of steps: on a strict shell a `push`/`pop`/`removeAt`/`move`/`clear` at a missing or wrong-typed path now reports a `MutationError` to `onError` (exported from the package root) instead of doing nothing. `shell.addCanvas({ mode: 'list' })` is a list canvas; `mode` was read only from `createShell`'s `canvases`. And an instance covered while its `mount` hook is still running stays suspended — `mount` set it back to `active` when the hook finished, leaving two active instances on a stack.

## 0.1.1

### Patch Changes

- 534eb4b: `@niscorp/strata` is a required peer: nova's shell and layout store and Prism's engine import its document-depth limit at load time, and with strata declared optional an app installing nova or Prism without it crashed on import. `check:packages` now follows every built entry's imports and refuses an undeclared one, or an optional peer loaded by a main entry.
