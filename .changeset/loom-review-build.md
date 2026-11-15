---
"@niscorp/loom": patch
---

Compiling a schema no longer crashes on a field whose own code throws on a missing value (a `z.preprocess` that trims its input): such a field is required.

A field named `toString` or `constructor` shows its validation message; the error tree read and wrote inherited names, so the message never appeared.

`onChange` and the editor's `change` event fire once for an edit the validation answers, where they fired twice with the same values (once for the edit, once for the validation it wrote back). Every other write is one call, as before.

The README says how to use `toNova` and `attachValidation` directly with a schema that has a top-level `_errors` field: compile it with `rootKey`, as the editor does.

The kit and the reference plugins draw their colours from CSS variables (`--loom-border`, `--loom-danger` and 23 more, listed in the README), each falling back to the colour used today, so nothing looks different until a host sets one.
