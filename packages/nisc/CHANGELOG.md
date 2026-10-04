# @niscorp/nisc

## 0.2.4

### Patch Changes

- af903c6: A page's head is its screen's own. `nisc export` wrote every path with the built `index.html`'s `<head>`, so a site with more than one page shipped each of them under the front page's title, description, preview card and canonical address.

  What a screen says about itself is now a node in a layout: nova's `nova:head`, with `title`, `description`, `image`, `kind` and `structured` bound to the action's data like any other node's props. It draws nothing — no adapter builds an element for it, no registry has to hold it, and a component is never handed one as a child — and it rides in the render tree, so it reaches a shell in the page, a snapshot a server drew and the trees on a wire alike. `headOf(api)` reads it off any of them; with more than one on the screen the last one speaks.
  - **nova** — `HEAD_NAME`, `HeadPropsSchema`, `HEAD_META`, `headOf`, `isHeadNode`; and `@niscorp/nova/document`: `placeHead` writes a head into an HTML document (the tag that said the same thing is replaced, a missing one is added before `</head>`, everything else is left as it was; values are escaped) and `createTitleKeeper` keeps a tab's title on it. The DOM, React and Vue adapters keep the title on the head as the screen moves, and give the page's own back when the screen has none.
  - **cli** — `build`, `export` and `start` write each path's document with its screen's head. "Same twice" also fails a boot that says a different head the second time, and the route table says whose head each path goes out with once an app has one. New config field `site`: the address the site is served at. With it every path says its own canonical address (`<link rel="canonical">`, `og:url`) and a head's picture gets a whole address; a build with several paths, a canonical tag in `index.html` and no `site` says so.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`site` on the config, `head` on the result), and the terminal keeps the tab's title off the wire for every render target.
  - **create-nisc** — the two own-shell templates say their welcome screen's head.

  **What to change:** nothing. An app with no `nova:head` node and no `site` is built, served and drawn exactly as before. An app that rewrote its exported files to give each page a head can delete that step: put the node in the layout and set `site`.

- Updated dependencies [af903c6]
  - @niscorp/nova@0.1.4
  - @niscorp/moss@0.2.4
  - @niscorp/cli@0.2.3

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
