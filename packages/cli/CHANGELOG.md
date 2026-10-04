# @niscorp/cli

## 0.2.3

### Patch Changes

- af903c6: A page's head is its screen's own. `nisc export` wrote every path with the built `index.html`'s `<head>`, so a site with more than one page shipped each of them under the front page's title, description, preview card and canonical address.

  What a screen says about itself is now a node in a layout: nova's `nova:head`, with `title`, `description`, `image`, `kind` and `structured` bound to the action's data like any other node's props. It draws nothing — no adapter builds an element for it, no registry has to hold it, and a component is never handed one as a child — and it rides in the render tree, so it reaches a shell in the page, a snapshot a server drew and the trees on a wire alike. `headOf(api)` reads it off any of them; with more than one on the screen the last one speaks.
  - **nova** — `HEAD_NAME`, `HeadPropsSchema`, `HEAD_META`, `headOf`, `isHeadNode`; and `@niscorp/nova/document`: `placeHead` writes a head into an HTML document (the tag that said the same thing is replaced, a missing one is added before `</head>`, everything else is left as it was; values are escaped) and `createTitleKeeper` keeps a tab's title on it. The DOM, React and Vue adapters keep the title on the head as the screen moves, and give the page's own back when the screen has none.
  - **cli** — `build`, `export` and `start` write each path's document with its screen's head. "Same twice" also fails a boot that says a different head the second time, and the route table says whose head each path goes out with once an app has one. New config field `site`: the address the site is served at. With it every path says its own canonical address (`<link rel="canonical">`, `og:url`) and a head's picture gets a whole address; a build with several paths, a canonical tag in `index.html` and no `site` says so.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`site` on the config, `head` on the result), and the terminal keeps the tab's title off the wire for every render target.
  - **create-nisc** — the two own-shell templates say their welcome screen's head.

  **What to change:** nothing. An app with no `nova:head` node and no `site` is built, served and drawn exactly as before. An app that rewrote its exported files to give each page a head can delete that step: put the node in the layout and set `site`.

## 0.2.2

### Patch Changes

- 8a04243: `nisc start` says what a browser may keep, and compresses what it sends — for an app with its own shell and an app behind moss alike. What the bundler wrote under `/assets/` goes out `public, max-age=31536000, immutable`; every other file is `no-cache` and answered `304` when it has not changed (an app with its own shell sent neither a validator nor a `Cache-Control` before, so a browser downloaded everything again on every visit). Documents, scripts, stylesheets, JSON, SVG and wasm go out brotli- or gzip-compressed, a piece at a time, with `Vary: Accept-Encoding`; the app server's own paths (`/api`, `/catalog`, …) are left alone. `nisc build` says so when it finds files of the app's own under `public/assets/`, which would be kept for a year under a name that says nothing about their content.
- 8a04243: `nisc build` writes the built page's stylesheet into the page. Once the app's vite has bundled, each stylesheet `dist/index.html` links by a plain local path is written into it as a `<style>`, so a drawn page paints from one response instead of waiting on a second request for its look. It is done once, to the file in `dist/`, so `build`, `export`, `start` and moss's document all hand out the same head; the stylesheet's own file stays. A link is left as it is, and the build says why, when the link says more than where the file is, the file is not in `dist/`, or the stylesheet names another file relative to itself.

  **What to change:** an app whose host sends a `Content-Security-Policy` that forbids inline styles sets `stylesheet: 'file'` in `nisc.config.ts` — otherwise the page loses its look. Nothing else changes for an app; with `--skip-bundle` the page is taken as it is.

## 0.2.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.

## 0.2.0

### Minor Changes

- 3a9866e: `nisc dev` starts the app's own vite itself (`--port`), and for an app behind moss adds moss's dev plugin fed from `nisc.config.ts` — the same boot and drawing `build` and `start` use. An app's `vite.config.ts` no longer carries any server glue. `NiscMossProject.dev.signIn(server, who)` makes `/dev/as/<who>` a signed-in URL in development.

### Patch Changes

- Updated dependencies [3a9866e]
  - @niscorp/moss@0.2.0
