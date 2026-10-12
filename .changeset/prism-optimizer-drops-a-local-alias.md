---
'@niscorp/prism': patch
---

The optimizer no longer keeps a local `isPlainObject` that only called `isJsonObject`; its three uses call `isJsonObject`. Prism's own `isPlainObject` means an object with no `$` key, and the local one of the same name meant any JSON object. No behaviour changed.

**What to change:** nothing.
