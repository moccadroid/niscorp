# @niscorp/moss

## 0.3.2

### Patch Changes

- a7d4de4: `server.charterReport()` — the charter report the server was verified by.

  `createServer` runs `verifyCharter` at boot and again on every `refresh`, refuses on the report's `errors`, and read nothing else of it. The rest was computed and dropped: the `warnings` (an action no role grants, an `allow` that matches nothing) and each role's closure `issues`. A host that wanted them had to run `verifyCharter` itself, over a data universe it built by hand.

  `charterReport()` returns that report: boot's, then that of each `refresh` that passed. A refresh that is refused leaves the one the server is still serving on. Nothing is printed, and boot refuses exactly what it refused before.

  ```ts
  const server = await createServer(app, runtime);
  for (const warning of server.charterReport().warnings)
    console.warn(`${warning.rule}: ${warning.detail}`);
  ```

  DOCS.md says one thing about what it holds: a push whose target is a binding (`@event.payload`, `$.target`) is listed among a role's `issues` as "not in the catalog", though it is resolved when the step runs.

  **What to change:** nothing.

- f70d461: DOCS and DESIGN say what boot refuses. `createServer` refuses on `verifyCharter`'s errors. The closure audit's findings are filed under each role's `issues` in the report and are neither refused nor printed: a role granted an action that pushes one it is not granted boots, and the press does nothing. Two source comments now say the same. No code changed.

  **What to change:** nothing.

- a7d4de4: The docs say a charter defines a role named `public`. A request with no session, and a signed-in principal with no assignment, resolve to that role, and the name is fixed. A charter without it still boots and nothing is said; those requests then fail with `Unknown role "public"` (a 500, a socket closed `4500`, a page served undrawn). `public: []` grants nothing. README, DOCS and DESIGN now say so, and a test holds it. No code changed.

  **What to change:** nothing, for a charter that has the role. One that names its visitor role something else adds `public` beside it.

- 979b3e3: `src/principal.ts` is text again. One separator in `wearableOf` was written as a raw NUL byte where the same file writes the escape `'\0'` two functions down, so git treated the whole file as binary: its diffs showed `Bin`, and a text search (`git grep -I`) skipped the file that defines `wearableOf`, `resolveFor` and `verifyCharter`.

  The byte is now the escape. The string it produces is the same one, and the built package is the same code: every built file is identical apart from the names of two chunks, which are hashes that take the embedded source text in.

  **What to change:** nothing.

## 0.3.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 1e6d55d: A pool's `query` and `transaction` are called on the pool, and a transaction's `query` on the transaction — never taken off the object first. A driver's own object has them as methods that need their receiver, and taken off they failed inside the driver, on a property nothing in nisc names:
  - **strata** — `migrate` and `upgradeStore` over a `PGlite` threw `Cannot read properties of undefined (reading '_checkReady')`; `status` and `readLedger` did too, once a ledger existed. A pool whose `transaction` hands a checked-out `pg` client through as the transaction failed in `migrate` the same way.
  - **moss** — `createTideStore` took `query` off the transaction. Over a pool that hands its client through, every transaction of the store failed inside the driver, and tide recorded the run as deferred: nothing threw, and the effect never ran.
  - **vex** — `createPostgresAdapter` with a read limit set (`limitReads`) threw on a pool whose `transaction` is a method.

  A `PGlite` now works as a pool as it is, and so does a `pg` wrapper that passes its client through. A pool built from closures (`createPglitePool`, a wrapper that builds its own `query`) behaves as before.

  **What to change:** nothing.

## 0.3.0

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

- Updated dependencies [de6d980]
- Updated dependencies [f1cec45]
  - @niscorp/nova@0.2.0
  - @niscorp/prism@0.2.0
  - @niscorp/vex@0.2.0

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
