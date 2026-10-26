---
'@niscorp/cli': patch
'@niscorp/nisc': patch
---

`nisc dev` registers the project's `routes` on the app server, as `nisc start` does, before it checks the app's functions.

A path that `dev.owned` sent to the app server for one of those routes was answered 404 under `nisc dev` and worked under `nisc start`.
