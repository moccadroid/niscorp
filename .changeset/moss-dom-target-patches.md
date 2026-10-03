---
'@niscorp/moss': patch
---

Docs: `domTarget` no longer redraws the page on every wire update — with a nova that keeps what did not change, an update costs what changed and nothing on the page loses its focus, scroll or animation to it. No change to moss's own code.
