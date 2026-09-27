---
'@niscorp/moss': minor
---

`inkTarget({ patchConsole })` — opt out of ink's console patching. Default unchanged (on). A host that renders several ink targets in one process — an SSH server, one per connection — turns it off, so the server's own logs never reach whoever is connected.
