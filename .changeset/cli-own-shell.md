---
'@niscorp/cli': minor
---

`nisc` runs an app that has its own shell and no moss. `nisc.config.ts` may hand over `shell` + `draw` + `adopt` (`NiscShellProject`) instead of a moss server (`NiscMossProject`). `nisc build` boots the app per path, draws the settled screen to markup and fails unless it is drawn, whole, the same on a second boot, and adopted clean by the app's own `adopt` inside a DOM (jsdom, installed in the app); it reports what each first screen opened with, can still call, and waits on. `nisc export` writes the folder — nothing when a check did not hold — and `nisc start` draws each path's first screen per request.

`@niscorp/moss` is now an optional peer, loaded only for an app behind moss; `@niscorp/nova` is a peer. `build()` returns `{ kind, ok, routes }` and `exportSite()` returns `{ written, result, out }` (they returned the route list).
