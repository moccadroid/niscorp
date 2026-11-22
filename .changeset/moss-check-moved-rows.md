---
"@niscorp/moss": patch
---

moss's `/api/vex` and `executeAs` now refuse an update that would move a row out of the caller's own update rule (400 `scope_denied`, nothing written), as vex does by default. An app that hands rows over that way keeps today's behaviour with `runtime.checkMovedRows: false`.
