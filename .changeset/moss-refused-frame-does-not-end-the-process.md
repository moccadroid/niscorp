---
"@niscorp/moss": patch
---

A frame the websocket transport refuses closes that connection; it no longer ends the process.

`attachSocket` listened for a connection's messages and its close, and not for its errors. `ws` reports what it refuses from a client — a malformed frame, text that is not UTF-8, a message over its size limit — as an `error` on that connection, and Node throws an `error` nobody listens for. So one such frame, from any client that could open the socket, signed in or not, ended the server process and every session on it. The transport now listens: `ws` has already closed the connection with the status that says why (1002, 1007, 1009), one line is logged (`[moss/node] a connection was closed on what it sent: …`), and nothing else is touched. Every host that calls `attachSocket` gets it — `serve`, `nisc start`, the vite plugin, an app's own listener.

**What to change:** nothing. An app this had happened to was not running. A process-level `uncaughtException` handler that was catching these no longer hears them.
