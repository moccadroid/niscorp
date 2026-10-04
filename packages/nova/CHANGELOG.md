# @niscorp/nova

## 0.1.4

### Patch Changes

- af903c6: A page's head is its screen's own. `nisc export` wrote every path with the built `index.html`'s `<head>`, so a site with more than one page shipped each of them under the front page's title, description, preview card and canonical address.

  What a screen says about itself is now a node in a layout: nova's `nova:head`, with `title`, `description`, `image`, `kind` and `structured` bound to the action's data like any other node's props. It draws nothing — no adapter builds an element for it, no registry has to hold it, and a component is never handed one as a child — and it rides in the render tree, so it reaches a shell in the page, a snapshot a server drew and the trees on a wire alike. `headOf(api)` reads it off any of them; with more than one on the screen the last one speaks.
  - **nova** — `HEAD_NAME`, `HeadPropsSchema`, `HEAD_META`, `headOf`, `isHeadNode`; and `@niscorp/nova/document`: `placeHead` writes a head into an HTML document (the tag that said the same thing is replaced, a missing one is added before `</head>`, everything else is left as it was; values are escaped) and `createTitleKeeper` keeps a tab's title on it. The DOM, React and Vue adapters keep the title on the head as the screen moves, and give the page's own back when the screen has none.
  - **cli** — `build`, `export` and `start` write each path's document with its screen's head. "Same twice" also fails a boot that says a different head the second time, and the route table says whose head each path goes out with once an app has one. New config field `site`: the address the site is served at. With it every path says its own canonical address (`<link rel="canonical">`, `og:url`) and a head's picture gets a whole address; a build with several paths, a canonical tag in `index.html` and no `site` says so.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`site` on the config, `head` on the result), and the terminal keeps the tab's title off the wire for every render target.
  - **create-nisc** — the two own-shell templates say their welcome screen's head.

  **What to change:** nothing. An app with no `nova:head` node and no `site` is built, served and drawn exactly as before. An app that rewrote its exported files to give each page a head can delete that step: put the node in the layout and set `site`.

## 0.1.3

### Patch Changes

- 80e1ee8: Documentation: the packages are live, and releases are compatible. `STYLE_GUIDE.md` gains "The packages are live" — a release does not break an app that works on the one before it; what should go is deprecated and stays; a breaking change is a last resort that needs the maintainer's approval before it is written — and `AGENTS.md` points every agent changing nisc itself to it. The status lines that said "pre-1.0, breaking changes expected" (nova), "API is pre-1.0 and moves" (moss) and "everything else may move" (tide) now say the same. moss's deprecated `installedIntegrations` is no longer described as scheduled for removal: it stays on the type. The style guide's Node floor is corrected to 22.12, what every package's `engines` already says. No code changes.

## 0.1.2

### Patch Changes

- 633d0d1: The DOM adapter (`@niscorp/nova/adapters/dom`) keeps what did not change. `createDomView` used to empty its root and build the whole screen again on every render; it now keeps the tree it drew beside the DOM that tree produced and patches the page, so an element whose part of the tree is the same as before is the same DOM node, never taken off the page. Focus, scroll, a selection, an open `<details>`, a running animation and a timer a component started are kept, and one changed string costs one text node. A change in one instance or on one canvas leaves the others alone; keyed lists move their elements; a different instance in the same place is still all new. The first render still replaces markup drawn ahead of time, and now gives somebody already typing in it their words, caret and focus back by where the field sits rather than by its `ref`.

  Fixed with it: typing in the second of two instances that share a `ref` moved focus (and the next keystroke) to the first; a bound field with no `ref` of its own lost focus after one keystroke; a pressed button lost focus to `<body>`; `debounce` did not coalesce across a render, and a pending value was not sent on blur.

  A DOM kit keeps working unchanged if its components are functions of their props and children. `DomComponentContext` gains two things: `onRemove(cleanup)`, run once when the element leaves the page for good, and `dependsOnChildren()`, for a component that marks or counts the children it holds. What a kit should check is in ADAPTER.md, "The DOM adapter keeps what did not change": a component is no longer called because something else on the page changed, children are patched in place only under an element that holds exactly them, and data that changes often should arrive as children rather than as a prop.

- 45d6731: Three fixes. `{ reset: 'path' }` run as a step — in a trigger, an `onSuccess`, a lifecycle hook — now restores the path's initial value; it set the path to `undefined`, because steps never handed the mutation the initial snapshot. The same omission kept strict mode out of steps: on a strict shell a `push`/`pop`/`removeAt`/`move`/`clear` at a missing or wrong-typed path now reports a `MutationError` to `onError` (exported from the package root) instead of doing nothing. `shell.addCanvas({ mode: 'list' })` is a list canvas; `mode` was read only from `createShell`'s `canvases`. And an instance covered while its `mount` hook is still running stays suspended — `mount` set it back to `active` when the hook finished, leaving two active instances on a stack.

## 0.1.1

### Patch Changes

- 534eb4b: `@niscorp/strata` is a required peer: nova's shell and layout store and Prism's engine import its document-depth limit at load time, and with strata declared optional an app installing nova or Prism without it crashed on import. `check:packages` now follows every built entry's imports and refuses an undeclared one, or an optional peer loaded by a main entry.
