# @niscorp/nova

## 0.2.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

### Patch Changes

- de6d980: A fix for the last fix: `nova:head` is the document's `<head>`, and holds what a head holds. 0.1.4 gave it five props (`title`, `description`, `image`, `kind`, `structured`) and wrote tags from them, which closed a head to whatever nova had been taught: no `og:image:alt`, no `og:type` but two, no whole address inside structured data. That was wrong, and it is replaced, not extended. The maintainer withdrew 0.1.4's props on 2026-10-04; this ships as a patch on that decision.

  **What to change** (only an app that used 0.1.4's props): a `nova:head` node no longer takes props. Write its children instead — `nova:title`, `nova:meta`, `nova:link`, `nova:script` — each with the element's attributes as its props. `{ title: X }` becomes `{ component: 'nova:title', children: X }`; `description` becomes `nova:meta` with `name: 'description'`; `image` and `kind` become `nova:meta` with `property: 'og:image'` and `property: 'og:type'`; `structured` becomes `nova:script` with `type: 'application/ld+json'` and `data`. `og:title` and `og:description` are no longer written from the title and description: say them if they are wanted. An address is written as given — a picture's is not made whole from `site`. Code that called `headOf`, `placeHead` or `createTitleKeeper`, or read `head` off `renderDocument`'s result or a route report, takes the new shapes below.
  - **nova** — a head's children are the elements a head holds, named as HTML names them, and **a child's props are that element's attributes, written as given**: nova keeps no list of them, so any `name`, `property` or `rel` can be said. Nothing in a head is drawn on the screen and no name has to be registered. With more than one head on a screen they are read in the order the screen is drawn, and an element that says the same thing as an earlier one (the title, a `<meta>` of that name or property, the canonical address) takes its place; anything else stands beside its like. What runs or styles is refused, left out and named: a script a browser would execute (`nova:script` is a data block — a JSON `type`, never a `src`), a stylesheet, `http-equiv`, a handler attribute. `headOf(api)` returns `{ elements, actions, refused }`. In `@niscorp/nova/document`, `placeHead(html, elements, { site, path })` writes them — an element takes the place of the tag that said the same thing, where it stood; what it wrote is marked `data-nova-head`, and a tag that gave way is kept inert in a `<template data-nova-own>` — and `createHeadKeeper(document)` replaces `createTitleKeeper`: the whole head follows the screen in the page, and the document's own tags come back when the screen stops saying them. Removed: the five props, the `Head` and `HeadProps` types, `createTitleKeeper`.
  - **cli** — `build`, `export` and `start` write each path's head from those elements. A head that holds what it may not fails the path, like any other check. `site` still gives every path its own canonical address and `og:url`; it no longer touches a picture's address.
  - **moss** — `renderDocument` and `exportDocuments` do the same from the snapshot (`head` on the result is `{ elements, actions, refused }`; a refusal is logged and left out), and the terminal keeps the whole head off the wire.
  - **create-nisc** — the two own-shell templates write their welcome screen's head this way.

  **Where a script goes:** in the app's own `index.html`, which holds anything and from which every page is written, or in the kit component that needs it. A layout is data and does not carry one.

- Updated dependencies [f1cec45]
  - @niscorp/prism@0.2.0

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
