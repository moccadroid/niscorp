---
'@niscorp/strata': patch
---

DESIGN.md no longer reads as if moss's `initIntegrations` were still there to call. Moss stopped exporting it (see the moss changeset): its integration tables are part of `MOSS_SEQUENCE`, which `createServer` and `migrateTables` run. The paragraph that names it is the record of what moved when strata landed, and it now says what has changed since. No code changed.

**What to change:** nothing.
