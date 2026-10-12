---
'@niscorp/nova': patch
---

The docs state seventy-three facts about the API that were written only in source comments.

README: what each reflect export returns (`walkNodes`, `snapshotShell`, `describeInstance`, `describeShell`, `actionGraph`, `auditCatalog`, `livenessOf`, `chainCycles`, the `*Keys` helpers), the devtools functions and how an app opens the inspector, `paletteFromRegistry`'s options and `paletteEntryOf`, what `collectInteractive` returns, an example's `replies`, `fetches`, `presses` and `expected`, what `headOf` returns, and `placeHead`'s `{ site, path }`. ACTION_DOCS.md: a catalog entry's `input`. ADAPTER.md, REACT_DOCS.md and TERMINAL_DOCS.md: what the kits' `Table` and `fallback` read, what a component's `dispatch` is for, what a Vue component and slot wrapper receive, a TTY interactive's `label` and `register`, how the terminal kits lay out and focus. I18N_DOCS.md: what counts as a binding and as a phrase, `fillPhrase` on a plain value, the form of `where`, and the order of a harvest. SHELL_DOCS.md: a layout given as a store id, what `back` passes over, `removeAction`, a reconcile entry's `with` and the call's `notes`, an unstamped `api.dispatch`, and what `canvasTree` counts as nothing.

Two statements are corrected. SHELL_DOCS.md said an `initial` seed equals a `shell.push` made after `createShell` returns; a seed is pushed with `history: false`, so `back` does not undo it. TERMINAL_DOCS.md said a model-bound field's marker resolves by `occurrence`; the Ink kit passes `occurrence` for a `Table` row only, and an `Input` or `Checkbox` resolves by its ref.

No behaviour changed.

**What to change:** nothing.
