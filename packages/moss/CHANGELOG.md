# @niscorp/moss

## 0.2.3

### Patch Changes

- 48da7db: `mountSite` answers a missing file with 404. A name with an extension that is neither a file in `dist` nor a page of the manifest used to fall through to the catch-all and come back as the drawn page with a 200 — so a browser holding a page from before a deploy asked for its old script and was handed a document. A page whose own path has a dot in it (`/docs/v1.2`) is still that page.
- 80e1ee8: Documentation: the packages are live, and releases are compatible. `STYLE_GUIDE.md` gains "The packages are live" — a release does not break an app that works on the one before it; what should go is deprecated and stays; a breaking change is a last resort that needs the maintainer's approval before it is written — and `AGENTS.md` points every agent changing nisc itself to it. The status lines that said "pre-1.0, breaking changes expected" (nova), "API is pre-1.0 and moves" (moss) and "everything else may move" (tide) now say the same. moss's deprecated `installedIntegrations` is no longer described as scheduled for removal: it stays on the type. The style guide's Node floor is corrected to 22.12, what every package's `engines` already says. No code changes.

## 0.2.2

### Patch Changes

- 633d0d1: Docs: `domTarget` no longer redraws the page on every wire update — with a nova that keeps what did not change, an update costs what changed and nothing on the page loses its focus, scroll or animation to it. No change to moss's own code.
- 45d6731: `installedIntegrations` on the manifest is marked deprecated: the server never called it. Which integrations are live for a principal's tenant is `installed` on the record `identity.resolve` returns.

## 0.2.1

### Patch Changes

- 2548e43: `domTarget({ root, registry })` with an app's own registry no longer injects nova's reference stylesheet or puts its class on the root — both restyled the app's kit over the app's own CSS. With no registry (the reference kit) nothing changes.

## 0.2.0

### Minor Changes

- 3a9866e: `@niscorp/moss/vite` — `mossDev({ app })`, the app server inside vite's dev process: loaded through vite so an edit re-boots it (the old server answers until the new one is up, then is let go with its timers), the socket attached once and delegating to whichever server is current, `/` and every page's path answered with its first screen drawn into vite's transformed index.html, moss's paths answered by the app server, and a dev-only `/dev/as/<who>` when the app can mint a token. `vite` is an optional peer. `MOSS_PATHS` is exported from `@niscorp/moss/node`.
