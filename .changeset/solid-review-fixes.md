---
"@niscorp/solid": patch
---

A key with a dot in it (`{"files":{"index.ts":…}}`) is kept and checked against the schema; before, it was dropped with an "expected <unknown path>" error, and strict mode failed the stream.
