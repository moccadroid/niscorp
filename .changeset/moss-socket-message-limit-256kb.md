---
"@niscorp/moss": patch
---

A message a terminal sends over the socket is at most 256 KB; a host that takes larger ones says so with `attachSocket`'s new `maxMessageBytes`.

**The setup this stops working for:** an app whose terminal sends a message over 256 KB — in practice a file put into a model value as base64 (a picked picture is megabytes). That message now closes the connection with `1009` and what it carried does not arrive; the terminal reconnects as after any other close, and a signed-in person's shell is as it was. To keep the old behaviour, a host that calls `attachSocket` passes the size it takes: `attachSocket(httpServer, server.socket, '/socket', { maxMessageBytes: 100 * 1024 * 1024 })` is what `ws` did before. `serve()`, `nisc start` and the vite plugin take the default and cannot raise it; an app on one of those that needs more attaches the socket itself. Better than raising it, and what `AGENTS.md` rule 9a says: a file never goes over the socket — the picker sends it to a route the app mounts, and the event carries what the route answered.

Why there is a limit. `attachSocket` created its `WebSocketServer` with no `maxPayload`, so the limit was `ws`'s own 100 MiB. Whatever a message carries, the server keeps — the value in the shell, and again in the last frame it sent — and sends back down in every later frame of that canvas. So the limit is what one connection, signed in or not, can make the process hold and re-send. Measured per open connection: 0.2 MB with nothing sent, 1.5 MB after a 256 KB value, 3.3 MB after 1 MiB, 48 MB after 16 MiB. Compression does not bound it — a 64 MB message of one repeated letter is 60 KB on the wire — so the count is of the message once inflated. What a terminal legitimately sends is an event: a press, a typed value, a row handed back. A few KB.

**What to change:** nothing, unless a terminal of yours sends more than 256 KB in one message — then one of the two things above. A typed value still has about 250,000 characters of room.
