# @niscorp/nisc

## 0.4.0

### Minor Changes

- f834f3f: `evaluate` checks a config object once and only evaluates it after that; `prismTransform` is gone. **Breaking.**

  BREAKING — approved by moccadroid, 2026-10-09: replace `prismTransform` with `evaluate` (`transform: evaluate`), and pass limits as `{ limits: … }`.

  Prism had three ways to run a config, and the one a host was told to hand to its seam (`prismTransform`) was the one that reported worst, while the hosts on a hot path each wrapped `evaluate`, which checked the config on every call. There are two now, with one job each.

  **`evaluate(config, source, options?)`** — for a config a program holds.
  - The first time it is handed a config object it checks it and keeps its tree; the second time it prepares the tree as `compile` would; from then on a call only evaluates. Four fields picked and renamed, the same config object again: 3.5 µs before, 0.4 µs now. A nested choice on two fields: 18 µs before, 0.7 µs now. A config that is a new object on every call costs what it did.
  - It is kept **by the object**: a config changed in place after its first call is not read again. Hand over a new object.
  - Both arguments are `unknown`, so it is what a host's transform seam takes: `createTide({ transform: evaluate })`, `createUpgrader(grammars, { transform: evaluate })`.
  - The third argument is `{ limits?, check? }`. Limits were the third argument themselves: `evaluate(config, source, { maxSteps: 100 })` is now `evaluate(config, source, { limits: { maxSteps: 100 } })`.
  - `check: 'always'` is for writing a config, for tests and for tools: nothing is kept, the config is checked on every call, and the source must be plain JSON (a source holding `undefined`, a function, a `Date` or a non-finite number is refused with `E_TYPE`).
  - An invalid config is a `PrismError` (`E_SCHEMA`) naming the part that is wrong, however deep the config. `prismTransform` threw zod's own error, and a `RangeError` for a config nested far past the limit.

  `evaluateSafe` takes the same arguments.

  **`compile` and `execute`** — for a config that is stored. Unchanged.

  **`prismTransform` is removed**, from `@niscorp/prism` and from `@niscorp/prism/migrations`. What it added over `evaluate` was a check that the source is plain JSON; that check is now `check: 'always'`, and a seam's source is taken as it is.

  **moss, nova, vex, loom, nisc, create-nisc and the cli move with it.** Each has Prism as a peer or a dependency, or has one of those that do, and a Prism at 0.3 is outside the range their last versions accept: an app takes them together. Nothing in vex, loom or the cli changed beyond that range.

  moss's shell and nova's `$prism` binding called `evaluate` on every use and so paid the check each time: an endpoint's request and response under moss, and a `$prism` value on each draw and for each row of a list, are 8 to 45 times faster for the configs measured. tide's and strata's documentation name `evaluate` where they named `prismTransform`.

  **What to change**
  - `import { prismTransform } from '@niscorp/prism'` or `'@niscorp/prism/migrations'` → `import { evaluate } from '@niscorp/prism'`, and `transform: prismTransform` → `transform: evaluate`. Every app made by `create-nisc` has this in `src/dev/strata.ts`; the app's typecheck and `npm run strata` both stop on that line until it is changed.
  - A third argument of limits becomes `{ limits: … }`.
  - A wrapper that parsed the config before calling `evaluate` (`evaluate(ConfigSchema.parse(config), …)`) makes a new object on every call and so is checked on every call: hand `evaluate` the config itself.
  - Code that changes a config object in place and evaluates it again must hand over a new object, or pass `{ check: 'always' }`.
  - A host that relied on `prismTransform` refusing a source that is not plain JSON checks it itself, or passes `{ check: 'always' }`.

### Patch Changes

- Updated dependencies [023bcf9]
- Updated dependencies [1db6df4]
- Updated dependencies [6d098e4]
- Updated dependencies [8b4d97e]
- Updated dependencies [f834f3f]
- Updated dependencies [b084e30]
- Updated dependencies [663d724]
- Updated dependencies [6512d91]
- Updated dependencies [7d682b9]
- Updated dependencies [d2e9d22]
- Updated dependencies [e0e8abc]
- Updated dependencies [7fe1135]
  - @niscorp/prism@0.3.0
  - @niscorp/moss@0.4.0
  - @niscorp/nova@0.3.0
  - @niscorp/vex@0.3.0
  - @niscorp/loom@0.3.0
  - @niscorp/cli@0.4.0
  - @niscorp/tide@0.1.5
  - @niscorp/strata@0.1.5

## 0.3.3

### Patch Changes

- 78a563f: A new app's terminal entry is `browserEnv()`, and AGENTS.md rule 12 says where a session is kept: in the browser's own cookie, which no script can read — not in `localStorage`, and not in a cookie copy.

  The rule used to tell an app that draws its pages on the server to keep a script-readable copy of the session token in a cookie (`browserEnv({ cookie: true })`) and to have every sign-in handoff store that copy too. moss now keeps the session itself, where the page cannot reach it, so the rule says the opposite: nothing in an app stores a token, and a sign-in the app answers over HTTP sets the session cookie on its response (`sessionCookies(request, token)`) and hands the page nothing. D5 and check 6d follow.

  **What to change:** nothing in an app that exists — `browserEnv({ cookie: true })` still compiles, and the option does nothing now.

- 9a30cfc: `AGENTS.md` no longer calls one lab app the exemplar. "Layout of an app" describes one arrangement and then says which apps to read: lyceum for a moss server app, nisc-website and moccadroid-website for an app with its own shell; atrium, lyra and relay are older, and are read for a surface they target, not as a model. `fable` and `mythos` are no longer called the reference degrade apps. And a working pattern says what a rebuilt server shell holds: what the app reads from rows as it builds — `inputs`, `seeds`, an action's mount hook — and nothing else, so a screen a person opened that no row describes is gone after a deploy, a restart or an idle spell.

  **What to change:** nothing.

- fc50d20: `AGENTS.md` says where files go. Rule 9a: file pickers live in the kit; a file never goes over the socket; the app saves it wherever it wants. The review pass's "no `fetch` outside the endpoint layer" gains its one exception, to send a file. No code changed.

  A picker that puts a file in its model value sends it over the socket as base64, and the tree brings it back on every render of that canvas. Measured against a moss server: one 15 MB file was 20 MB up and 100 MB down across five renders. Sent by the picker to a route the app mounts on its server, or to a system the app already has, the same file put nothing on the socket.

  moss gains a test and nothing else: a route an app adds to the built server reads who is asking, as moss's own surfaces do.

  **What to change:** nothing for the rule itself. But this release also limits a message a terminal sends to 256 KB (the moss entry on the socket's message limit), so a picker that emits a file's bytes as its model value now works only for a file under about 190 KB: send the file from the picker, as rule 9a says, or raise the limit where the app attaches the socket.

- 64d3765: AGENTS.md: `nisc migrate`, where an app deployed with it puts its tables, and where the rows it needs to start are written.

  The toolbox row for `cli` names the command. Rule 17 gains two sentences. An app deployed with `nisc migrate` hands its `<app>.app` sequence to moss (`runtime.tables`, with `TIDE_SEQUENCE` when it keeps tide's tables), and the function that opens its runtime migrates and seeds nothing: what it changes itself is changed before the step can check it. And rows an app needs in order to start are written by a migration step, in the same transaction as its tables; a seed that runs at start is for development and demos.

  **What to change:** nothing.

- 9311312: AGENTS.md: every list states its `limit`, and a parent and its children are one batch.

  The worked `todos/open` entry stated no `limit`, so the guide's own example was a list the engine would stop at 100 rows. It states one now, and "Using Vex" says why: a seeded entry reads at most the `limit` it states, and a list without one gets the default.

  "Using Vex" also gains the batch form for a write that creates a parent and its children: `{ $returned: 'table.column' }` reads the row an earlier statement of the same batch wrote, and the bullet says what the reply of such a batch looks like.

  **What to change:** nothing.

- Updated dependencies [7f8d202]
- Updated dependencies [8abbb96]
- Updated dependencies [78a563f]
- Updated dependencies [51dc5ce]
- Updated dependencies [da42472]
- Updated dependencies [a91b5db]
- Updated dependencies [812c464]
- Updated dependencies [770f754]
- Updated dependencies [61a4060]
- Updated dependencies [8012cd8]
- Updated dependencies [10875eb]
- Updated dependencies [fc50d20]
- Updated dependencies [2b5fd83]
- Updated dependencies [1e5ad2d]
- Updated dependencies [2011951]
- Updated dependencies [2c57a38]
- Updated dependencies [2d20daf]
- Updated dependencies [b711c38]
- Updated dependencies [3d8518c]
- Updated dependencies [b711c38]
- Updated dependencies [1903342]
  - @niscorp/nova@0.2.2
  - @niscorp/prism@0.2.2
  - @niscorp/strata@0.1.4
  - @niscorp/cli@0.3.2
  - @niscorp/moss@0.3.3
  - @niscorp/vex@0.2.3

## 0.3.2

### Patch Changes

- 6ab6f2b: `AGENTS.md` rule 10 says every charter defines a role named `public`. It is what a request with no session, and a signed-in principal with no assignment, resolve to; the name is fixed, and `public: []` grants nothing. Boot does not check for it: without it those requests fail with `Unknown role "public"`.

  **What to change:** nothing, for a charter that has the role.

- bd3184d: An upgrade keeps a document's stamp entries for grammars the upgrader was not given.

  `upgrade` handed back the upgrader's own stamp, and `upgradeStore` wrote it over the row's. A row stamped `{ "acme.forms": 0, "acme.prices": 1 }`, upgraded by code that was given `acme.forms` only, was written back stamped `{ "acme.forms": 1 }`: its record of `acme.prices` was gone. Code that has that grammar then read the row as never migrated and ran `acme.prices/1` over it a second time — a price already in cents, multiplied again.

  The stamp now handed back, and written, is the upgrader's own plus the document's entries for any grammar it was not given, as they were. Nothing new is refused, and nothing else is written differently: for a document whose stamp names only the upgrader's grammars, `upgrade` returns `upgrader.stamp` itself, as before. `upgrader.stamp`, `behind`, the lock file and every ledger checksum are untouched.

  `TOO_NEW` is, as it always was, about the grammars the code was given — a stamp entry for one it was not given is neither ahead nor behind. The README, DESIGN and rule 19 of `@niscorp/nisc`'s `AGENTS.md` said "on any grammar"; they now say "on any grammar the code was given".

  **What to change:** nothing.

- Updated dependencies [2756aa7]
- Updated dependencies [0b5a7d6]
- Updated dependencies [4abbfcc]
- Updated dependencies [a02a031]
- Updated dependencies [d5c9d58]
- Updated dependencies [fa3f038]
- Updated dependencies [659b81e]
- Updated dependencies [3029c34]
- Updated dependencies [a7d4de4]
- Updated dependencies [f70d461]
- Updated dependencies [a7d4de4]
- Updated dependencies [979b3e3]
- Updated dependencies [63445cb]
- Updated dependencies [8973c15]
- Updated dependencies [ce21cf7]
- Updated dependencies [5923e38]
- Updated dependencies [2815107]
- Updated dependencies [885bc1e]
- Updated dependencies [f9f1b26]
- Updated dependencies [e3e0ff2]
- Updated dependencies [ed9d7f4]
- Updated dependencies [18182d7]
- Updated dependencies [bd3184d]
- Updated dependencies [bab7b2c]
- Updated dependencies [eef9cd9]
- Updated dependencies [e9ad028]
- Updated dependencies [1dfab19]
- Updated dependencies [008b5e8]
  - @niscorp/cortex@0.1.3
  - @niscorp/loom@0.2.2
  - @niscorp/moss@0.3.2
  - @niscorp/signal@0.1.3
  - @niscorp/solid@0.1.2
  - @niscorp/strata@0.1.3
  - @niscorp/tide@0.1.4
  - @niscorp/vex@0.2.2

## 0.3.1

### Patch Changes

- 353b3c3: `@niscorp/nova/examples` — the reference as data. `NOVA_EXAMPLES` is 42 examples, in six groups (`NOVA_EXAMPLE_GROUPS`): the layout grammar (12), actions at work (7), endpoints (5), composition with fragments (5), shells (8) and i18n (5).

  An example is a small app, what is done to it, and what it must then say: `{ id, group, title, description, action | shell, fragments?, layouts?, replies?, fetches?, phrases?, phraseKeys?, stage?, presses, expected }`. `action` is one action alone on one canvas (an example of the layout grammar is an action with no triggers); `shell` is several actions on several canvases. `replies` and `fetches` say what its endpoints are answered, so an example comes to the same thing wherever it is run. `presses` is what is done: a press, something typed, or the host changing the language. `expected` is every piece of text the screen then holds (its text, and what stands in props at a prose key), the one action's data, which actions stand on each canvas, and what was sent to each URL.

  Every id an example brings begins with its own, so a host can hold all of them in one shell. The examples a host puts on its stage name only the plain components every kit has (`Stack`, `Text`, `Button`, `Input`) and nova's two slots, with no prop about looks, so whoever shows them draws them with its own kit. An example with `stage: false` (the five on i18n) is shown as what it comes to. The package's tests run each one and hold it to its `expected`.

  Not in it: the adapters' own seams (`slotWrapper`), the look of nova's default components, and the harvest functions of `@niscorp/nova/i18n`, which are called, not mounted.

  **What to change:** nothing.

- 259a6f7: `@niscorp/prism/examples` — the reference as data. `PRISM_EXAMPLES` is 82 examples (`{ id, group, title, description, op?, source, config, expected }`): one for each of the 73 operators, named by the operator, then nine configs of several operators working together. `PRISM_EXAMPLE_GROUPS` names the groups they come in — the reference's own (Core, Arrays, Math, …), in its order. The package's tests evaluate each example against its `expected`, and fail when an operator has no example of its own or has two, so whatever shows them shows what the installed version does. `OP_KEYS`, the grammar's operator names in its own order, is now exported from the main entry. STYLE_GUIDE.md gains "Examples": a change to what a package does changes its examples in the same commit.
- Updated dependencies [06d1531]
- Updated dependencies [fe30458]
- Updated dependencies [353b3c3]
- Updated dependencies [7222c7d]
- Updated dependencies [c8982c2]
- Updated dependencies [1e6d55d]
- Updated dependencies [259a6f7]
- Updated dependencies [f801cc9]
- Updated dependencies [fc31d1d]
- Updated dependencies [18626f8]
- Updated dependencies [d2f0357]
- Updated dependencies [5c70059]
  - @niscorp/cortex@0.1.2
  - @niscorp/charter@0.1.2
  - @niscorp/cli@0.3.1
  - @niscorp/loom@0.2.1
  - @niscorp/moss@0.3.1
  - @niscorp/nova@0.2.1
  - @niscorp/prism@0.2.1
  - @niscorp/signal@0.1.2
  - @niscorp/solid@0.1.1
  - @niscorp/strata@0.1.2
  - @niscorp/tide@0.1.3
  - @niscorp/vex@0.2.1

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
  - @niscorp/moss@0.3.0
  - @niscorp/cli@0.3.0
  - @niscorp/prism@0.2.0
  - @niscorp/vex@0.2.0
  - @niscorp/loom@0.2.0

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
