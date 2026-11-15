---
"@niscorp/vex": patch
---

A table joined to itself now gets its row rules on both copies, an adapter given `schema` reads that schema's tables, a semantic `$scope` text comes from the server, and discovery leaves out entries whose `exists` reads a table the caller cannot read. Tables, subqueries and columns with capitals or reserved names can be read and written, and a model that writes `null` for a key it leaves out is no longer refused.
