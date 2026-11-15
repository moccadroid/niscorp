---
"@niscorp/loom": patch
---

Compiling a schema no longer crashes on a field whose own code throws on a missing value (a `z.preprocess` that trims its input): such a field is required.

A field named `toString` or `constructor` shows its validation message; the error tree read and wrote inherited names, so the message never appeared.

`onChange` and the editor's `change` event fire once per edit, with the same values as before; each edit fired twice, once for the edit and once for the validation it wrote back.
