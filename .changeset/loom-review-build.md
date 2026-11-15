---
"@niscorp/loom": patch
---

Compiling a schema no longer crashes on a field whose own code throws on a missing value (a `z.preprocess` that trims its input): such a field is required.

A field named `toString` or `constructor` shows its validation message; the error tree read and wrote inherited names, so the message never appeared.
