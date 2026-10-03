# @niscorp/nisc

## 0.2.1

### Patch Changes

- Updated dependencies [2548e43]
  - @niscorp/moss@0.2.1

## 0.2.0

### Minor Changes

- 3a9866e: `@niscorp/moss/vite` — `mossDev({ app })`, the app server inside vite's dev process: loaded through vite so an edit re-boots it (the old server answers until the new one is up, then is let go with its timers), the socket attached once and delegating to whichever server is current, `/` and every page's path answered with its first screen drawn into vite's transformed index.html, moss's paths answered by the app server, and a dev-only `/dev/as/<who>` when the app can mint a token. `vite` is an optional peer. `MOSS_PATHS` is exported from `@niscorp/moss/node`.
- a768f3b: `@niscorp/nisc` carries the rulebook: `AGENTS.md` and `STYLE_GUIDE.md` ship in the package, so an app reads the rules for the nisc version it has installed (`node_modules/@niscorp/nisc/AGENTS.md`). The repository's root files are links to them.

### Patch Changes

- Updated dependencies [3a9866e]
- Updated dependencies [3a9866e]
- Updated dependencies [534eb4b]
  - @niscorp/cli@0.2.0
  - @niscorp/moss@0.2.0
  - @niscorp/nova@0.1.1
  - @niscorp/prism@0.1.1
