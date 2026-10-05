---
"@niscorp/strata": patch
---

README corrections. `sqlSteps` cuts at each line that ends in `;`, full-line `--` comments excepted. It is not a SQL parser: a `;` that ends a line inside a string, a function body, a `/* */` comment or a trailing `--` comment cuts there too, and two statements on one line, or a `;` followed by a trailing comment, stay one step. The `compareSnapshot` example shows the lines it prints (`- required["id"]`, `+ required["key"]`). No code changed.

**What to change:** nothing.
