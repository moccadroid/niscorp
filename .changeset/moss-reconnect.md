---
"@niscorp/moss": patch
---

A terminal on a phone no longer loses what is pressed around a reconnect, and either end finds out when a socket has died.

- **Connected means the screen arrived.** The wire reads `'open'` from the connection's first frame, not from the socket opening: an event sent in between reached a server that was not listening yet, and was lost without a word. A server that serves no shell now sends an empty frame too.
- **The page coming back is a check.** `WireEnv.onResume` (in `browserEnv`: `visibilitychange`, a `pageshow` from the back-forward cache, `online`) makes a closed connection again at once instead of after the backoff, and asks an open one for its screen (`resync`) while its status stays `'open'`; one that answers nothing within 2 seconds, or closes meanwhile, is replaced at once.
- **A quiet socket is checked too.** After 25 seconds of hearing nothing, while the page is visible (`WireEnv.visible`), the wire sends a `ping`, which the server answers `pong`; no answer within 10 seconds replaces the socket. Nothing waits for the answer meanwhile. `ping` comes without a protocol of its own: a server from before it answers `invalid_message`, which counts as an answer.
- **An event pressed while nothing can carry it is kept**, with the tree of its canvas, and sent once that canvas comes back exactly as it was — all kept events together, in order, or none of them; a press on the live screen, or 5 seconds, or a change of who is signed in, drops them. `droppedEvents()` on what `createWire` returns counts them (optional on the `Wire` type, so a stand-in wire an app makes itself still fits).
- **The server finds connections that are gone.** The Node transport pings every connection every 30 seconds (the WebSocket protocol's own ping, which a browser that is awake answers by itself, whatever its moss) and closes one that has not answered the last ping. A phone that went away without closing no longer keeps its shell for nobody, or its place under `anonymousShellMax`, until TCP gives up, and a signed-in person's shell starts its idle time. A phone that has put the page away answers nothing either: its shell for nobody is disposed after about a minute instead of whenever TCP gave up.
- **A screen sent again draws nothing.** A frame or canvas identical to the one on screen notifies no subscriber: a page coming back does not redraw an unchanged app, and a reconnect redraws no canvas that did not change.

**What to change:** nothing. An app that wants to tell the person a press was dropped reads `wire.droppedEvents()`. Update the server before its pages: a terminal of this release against a server of an earlier one logs an `invalid_message` warning for each ping, and against one that serves no shell it stays `'connecting'`.
