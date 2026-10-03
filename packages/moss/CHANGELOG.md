# @niscorp/moss

## 0.2.1

### Patch Changes

- 2548e43: `domTarget({ root, registry })` with an app's own registry no longer injects nova's reference stylesheet or puts its class on the root — both restyled the app's kit over the app's own CSS. With no registry (the reference kit) nothing changes.

## 0.2.0

### Minor Changes

- 3a9866e: `@niscorp/moss/vite` — `mossDev({ app })`, the app server inside vite's dev process: loaded through vite so an edit re-boots it (the old server answers until the new one is up, then is let go with its timers), the socket attached once and delegating to whichever server is current, `/` and every page's path answered with its first screen drawn into vite's transformed index.html, moss's paths answered by the app server, and a dev-only `/dev/as/<who>` when the app can mint a token. `vite` is an optional peer. `MOSS_PATHS` is exported from `@niscorp/moss/node`.
