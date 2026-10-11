---
'@niscorp/strata': patch
---

DESIGN.md no longer reads as if moss's `initIntegrations` and `initSessions` were still there to call. Moss stopped exporting both (see the moss changeset): its integration tables are part of `MOSS_SEQUENCE`, and the sessions table is made where a deployment keeps moss's stored sessions (`session: 'sessions'`); `createServer` and `migrateTables` run both. The paragraph that names it is the record of what moved when strata landed, and it now says what has changed since. No code changed.

**What to change:** nothing.
