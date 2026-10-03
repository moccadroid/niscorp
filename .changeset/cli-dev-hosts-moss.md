---
'@niscorp/cli': minor
---

`nisc dev` starts the app's own vite itself (`--port`), and for an app behind moss adds moss's dev plugin fed from `nisc.config.ts` — the same boot and drawing `build` and `start` use. An app's `vite.config.ts` no longer carries any server glue. `NiscMossProject.dev.signIn(server, who)` makes `/dev/as/<who>` a signed-in URL in development.
