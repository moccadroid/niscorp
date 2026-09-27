---
'@niscorp/nova': minor
---

The TTY walker records the action instance each interactive sits in: `TtyInteractive.origin` (the enclosing `ActionSlot`'s `instanceId`; a `CanvasSlot` starts outside any). A list canvas renders several live instances that share refs, and a host that dispatches a numbered interactive without it reaches whichever instance the server falls back to.
