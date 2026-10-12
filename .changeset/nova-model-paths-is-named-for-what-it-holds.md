---
'@niscorp/nova': patch
---

Inside the action runtime, the map from a `ui:model` node's ref to the state path it writes is named `modelPaths`; it was `modelListeners` and holds no listener. `teardownModelListeners`, which only cleared that map, is gone and its two callers clear the map. No behaviour changed.

**What to change:** nothing.
