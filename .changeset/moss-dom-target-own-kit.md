---
'@niscorp/moss': patch
---

`domTarget({ root, registry })` with an app's own registry no longer injects nova's reference stylesheet or puts its class on the root — both restyled the app's kit over the app's own CSS. With no registry (the reference kit) nothing changes.
