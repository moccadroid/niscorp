---
'@niscorp/moss': patch
'@niscorp/nisc': patch
'@niscorp/cli': patch
---

The docs say where `server.checkFunctions()` goes: after every route of the app's own, before it listens.

Nobody's shell makes its reads in-process, and the server takes no route once it has answered one: a route mounted after the check throws `Can not add a route since the matcher is already built.` moss's DOCS, nisc's AGENTS and the cli README say so.
