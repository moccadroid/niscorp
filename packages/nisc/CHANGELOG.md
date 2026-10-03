# @niscorp/nisc

## 0.2.3

### Patch Changes

- 80e1ee8: Documentation: the packages are live, and releases are compatible. `STYLE_GUIDE.md` gains "The packages are live" — a release does not break an app that works on the one before it; what should go is deprecated and stays; a breaking change is a last resort that needs the maintainer's approval before it is written — and `AGENTS.md` points every agent changing nisc itself to it. The status lines that said "pre-1.0, breaking changes expected" (nova), "API is pre-1.0 and moves" (moss) and "everything else may move" (tide) now say the same. moss's deprecated `installedIntegrations` is no longer described as scheduled for removal: it stays on the type. The style guide's Node floor is corrected to 22.12, what every package's `engines` already says. No code changes.
- Updated dependencies [48da7db]
- Updated dependencies [8a04243]
- Updated dependencies [8a04243]
- Updated dependencies [80e1ee8]
  - @niscorp/moss@0.2.3
  - @niscorp/cli@0.2.2
  - @niscorp/nova@0.1.3
  - @niscorp/tide@0.1.2

## 0.2.2

### Patch Changes

- Updated dependencies [b67a125]
- Updated dependencies [633d0d1]
- Updated dependencies [45d6731]
- Updated dependencies [633d0d1]
- Updated dependencies [45d6731]
- Updated dependencies [45d6731]
- Updated dependencies [45d6731]
  - @niscorp/charter@0.1.1
  - @niscorp/cli@0.2.1
  - @niscorp/cortex@0.1.1
  - @niscorp/loom@0.1.1
  - @niscorp/prism@0.1.2
  - @niscorp/signal@0.1.1
  - @niscorp/strata@0.1.1
  - @niscorp/moss@0.2.2
  - @niscorp/nova@0.1.2
  - @niscorp/tide@0.1.1
  - @niscorp/vex@0.1.1

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
