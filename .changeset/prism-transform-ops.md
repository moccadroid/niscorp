---
"@niscorp/prism": minor
"@niscorp/nova": minor
---

Transform ops for rewriting documents: `$has`, `$renameKeys`, `$update`, `$assert`, `$walk`. `$ref: "$"` reads the whole source; `$join.parts` may be any node that evaluates to an array. Validation errors name the branch the config meant, with its full path, instead of "Invalid input" at the root. Fixed: the compiler constant-folded `$ref`/`$var` whose only input was a literal — `{ "$ref": "$" }` and `"$."` compiled to `{}`. Breaking, narrowly: an op name can no longer be used as a plain template key (a template key pattern, now also in the JSON Schema). Grammar migration `nisc.prism/1` (a marker).
