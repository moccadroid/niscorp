# create-nisc

## 0.2.4

### Patch Changes

- af903c6: A page's head is its screen's own. `nisc export` wrote every path with the built `index.html`'s `<head>`, so a site with more than one page shipped each of them under the front page's title, description, preview card and canonical address.

  What a screen says about itself is now a node in a layout: nova's `nova:head`, with `title`, `description`, `image`, `kind` and `structured` bound to the action's data like any other node's props. It draws nothing — no adapter builds an element for it, no registry has to hold it, and a component is never handed one as a child — and it rides in the render tree, so it reaches a shell in the page, a snapshot a server drew and the trees on a wire alike. `headOf(api)` reads it off any of them; with more than one on the screen the last one speaks.
  - **nova** — `HEAD_NAME`, `HeadPropsSchema`, `HEAD_META`, `headOf`, `isHeadNode`; and `@niscorp/nova/document`: `placeHead` writes a head into an HTML document (the tag that said the same thing is replaced, a missing one is added before `</head>`, everything else is left as it was; values are escaped) and `createTitleKeeper` keeps a tab's title on it. The DOM, React and Vue adapters keep the title on the head as the screen moves, and give the page's own back when the screen has none.
  - **cli** — `build`, `export` and `start` write each path's document with its screen's head. "Same twice" also fails a boot that says a different head the second time, and the route table says whose head each path goes out with once an app has one. New config field `site`: the address the site is served at. With it every path says its own canonical address (`<link rel="canonical">`, `og:url`) and a head's picture gets a whole address; a build with several paths, a canonical tag in `index.html` and no `site` says so.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`site` on the config, `head` on the result), and the terminal keeps the tab's title off the wire for every render target.
  - **create-nisc** — the two own-shell templates say their welcome screen's head.

  **What to change:** nothing. An app with no `nova:head` node and no `site` is built, served and drawn exactly as before. An app that rewrote its exported files to give each page a head can delete that step: put the node in the layout and set `site`.

## 0.2.3

No changes in this release.

## 0.2.2

No changes in this release.

## 0.2.1

### Patch Changes

- d24bce8: The package no longer carries the templates' local `.turbo` logs or a stale build chunk, and `check:create` holds its tarball to the templates as source and nothing built or local.
