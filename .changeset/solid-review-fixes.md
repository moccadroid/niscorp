---
"@niscorp/solid": patch
---

A key with a dot in it (`{"files":{"index.ts":…}}`) is kept and checked against the schema; before, it was dropped with an "expected <unknown path>" error, and strict mode failed the stream.

A listener that throws no longer cuts `write()` or `close()` short: the chunk is still parsed, every other listener and selection still hears of the change, and the call then throws that listener's error. Before, the rest of the chunk was lost and the stream could stop telling new listeners of changes.
