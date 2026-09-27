---
"@niscorp/strata": patch
"@niscorp/nisc": patch
---

The grammar gate no longer loses a field named `description` or `$ref`. It stripped every key called `description` — the `.describe()` keyword, but also a field of that name, so adding, retyping or removing nova's optional `description` passed with no migration — and the canonical compare skipped every key called `$ref`, Prism's op of that name included. Both now apply only where the name is a keyword. `snapshotOf` records the schema as the validator wrote it (keys sorted, nothing removed); all normalizing happens in `compareSnapshot`, so what the gate ignores can change without touching a recorded file.
