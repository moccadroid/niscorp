---
"@niscorp/nisc": patch
"@niscorp/moss": patch
---

`AGENTS.md` says where files go. Rule 9a: file pickers live in the kit; a file never goes over the socket; the app saves it wherever it wants. The review pass's "no `fetch` outside the endpoint layer" gains its one exception, to send a file. No code changed.

A picker that puts a file in its model value sends it over the socket as base64, and the tree brings it back on every render of that canvas. Measured against a moss server: one 15 MB file was 20 MB up and 100 MB down across five renders. Sent by the picker to a route the app mounts on its server, or to a system the app already has, the same file put nothing on the socket.

moss gains a test and nothing else: a route an app adds to the built server reads who is asking, as moss's own surfaces do.

**What to change:** nothing for the rule itself. But this release also limits a message a terminal sends to 256 KB (the moss entry on the socket's message limit), so a picker that emits a file's bytes as its model value now works only for a file under about 190 KB: send the file from the picker, as rule 9a says, or raise the limit where the app attaches the socket.
