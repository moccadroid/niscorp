---
'@niscorp/moss': patch
'@niscorp/nisc': patch
'@niscorp/cli': patch
---

`session.answerIntent(writers, asked)` also replays a query that exists: `asked` may be `{ fingerprint, context }`.

It is answered as the caller, as an intent is, with what vex knows of the query: the context keys it binds, the ones the call left out (`meta.missingContext`), its warnings. The wire answers a replay with the rows alone. A model that proves a query before it builds on it learns from this why a replay came back empty.
