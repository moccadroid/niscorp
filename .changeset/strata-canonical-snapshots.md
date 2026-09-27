---
"@niscorp/strata": patch
"@niscorp/nisc": patch
---

`compareSnapshot` reads both sides in canonical form, so a validator respelling a schema is not a grammar change: definitions are inlined unless recursive (and those renamed by first use), `allOf: [{ $ref }]` reads as `$ref`, and a union of bare types as a type list. Snapshot files are written as before. Moving the workspace from zod 4.3 to 4.6 had turned both nisc grammars red with no grammar change.
