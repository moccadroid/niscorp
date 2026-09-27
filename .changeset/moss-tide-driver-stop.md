---
'@niscorp/moss': minor
---

The tide driver's `stop()` returns a promise that resolves once nothing it started is still touching the store — the drain in flight and the next-due read after it — so a host can await it before closing the database. The next-due read after every drain no longer rejects unhandled: a store closing under it used to take the host's whole process down (a dev server re-booting over PGlite).
