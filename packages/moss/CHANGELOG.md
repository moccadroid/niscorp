# @niscorp/moss

## 0.3.3

### Patch Changes

- 78a563f: A page served by its app no longer holds its session: the browser does, in a cookie no script can read.

  A session token in a page — in `localStorage`, or in the script-readable cookie copy `browserEnv({ cookie: true })` kept — is there for anything else that runs in that page to take. Now the server writes the session into a cookie the page cannot read (`HttpOnly`, `SameSite=Lax`; `__Host-` prefixed and `Secure` over https) in its answer to the socket's upgrade, and the browser sends it by itself with the two requests that need to know who is asking: the page, and the upgrade. After a reload the page holds nothing.

  **The setup this stops working for:** code that read the session token out of the page. `localStorage['nisc.token']` is empty once the browser holds the session, and the cookie copy is no longer written, so anything that took the token from there — to call a route with `Authorization: Bearer`, say — finds nothing. No route answers to the new cookie, on purpose: a browser sends a cookie with requests another site makes it send. And `renderDocument` no longer answers a cookie that does not resolve with a `Set-Cookie` that takes it back; the upgrade is the one place the cookie is written.

  What happens, and to whom:
  - **Only the app's own page.** The cookie is read and written when the upgrade's `Origin` is the host it was addressed to, or one listed in the new `runtime.origins` (for a proxy that rewrites `Host`). A page on another origin — which a browser sends the cookie with all the same — is nobody. A terminal that is not a page of its app (a process on `nodeEnv`, a page served from somewhere else, a browser that refuses cookies) holds its own token and offers it, exactly as before.
  - **Nobody is signed out by the update.** A token an earlier build left in storage is offered once, moved into the cookie by the answer, and removed from storage along with the old copy.
  - **Seats.** The cookie is named by the terminal's `tokenKey`, so several people can be signed in on one origin as before; the terminal names its key in the socket's address (`?key=`), and `renderDocument`'s `tokenKey` reads the same one. The name ends with the port when the page is on one — a browser keeps cookies by host, not port, and two apps on localhost would otherwise sign each other out — so `renderDocument` takes `request.host`; `mountSite` and the vite plugin pass it.
  - **Signing out.** A cookie that no longer resolves is taken back on the next upgrade. Under an app's own identity provider the token may go on resolving, so a terminal that was signed out says so (`?leave=1`) and the cookie is taken back whatever it holds.
  - **A sign-in the app answers over HTTP** (a link redeemed, a provider's callback) sets the cookie itself: `sessionCookies(request, token, { key?, lastsMs? })`, exported from the package root, returns the `Set-Cookie` values. The page that follows is signed in and was never handed the token. The vite plugin's `/dev/as/<who>` does this now.
  - **A transport of your own** passes what the request carried — `connection.upgrade = { offered, origin, host, cookie }` — and, to let the cookie be written, leaves the request unanswered until the connection is first used, answering then with the cookies moss named through `upgrade.answer(cookies)` (moss names them before it uses the connection, and names none when there are none to write). One that has already answered reads the cookie and writes none. `attachSocket` does both.
  - **A `WireEnv` of your own** is unchanged: without `tokens.held` a terminal stores its token as it always did.

  **What to change:** nothing in an app that uses `createWire` with `browserEnv()` and serves with `serve`, `nisc start`, the vite plugin or `attachSocket`. `browserEnv({ cookie: true })` still compiles and the option now does nothing; drop it when convenient. A sign-in page that writes the token to `localStorage` keeps working (the token is moved on the next upgrade), and is better replaced by `sessionCookies` on the response. Behind a proxy that rewrites `Host`, list the app's origin in `runtime.origins` — until then every page looks like one served from somewhere else, so the app works as it did before this change, each terminal holding its own token, and moss says so once in the log. An app that draws its own pages passes `request.host` to `renderDocument`; behind a proxy that rewrites `Host` to an upstream on another port, `site` is where the port is taken from.

- 51dc5ce: DESIGN says what a rebuilt shell holds. "Durability" named a projection as the durable thing, and moss has built none ("Deliberately unbuilt" lists it). It now says the database is the durable thing: a shell is rebuilt on the next connection from definitions and whatever the app reads from rows as it builds, and evicting an idle shell, restarting the process and `reset` each cost what was only in the shell — the screens someone had opened, and what they had typed. Two source comments now say the same. No code changed.

  **What to change:** nothing.

- da42472: With `shellFrameDelta` on, a canvas whose frame is over 64 KB is sent whole, and no longer compared.

  Encoding a delta costs the server in proportion to the size of the two frames, not of the change, and it does the work on the thread every session shares. Nothing bounded it. Measured on the encoder alone: a 0.3 MB frame held the thread 65 ms for one changed letter, a 2.7 MB frame over a second, and at 20 MB it ran for eight seconds, took a gigabyte and failed — after which the frame was sent whole anyway. Every session on the process waited each time. A large frame needs nothing unusual: a long table, or one long value in a bound field, which any terminal can send. Now a change is sent whole, with no encode, when the frame the terminals hold or the frame replacing it is longer than 64 KB — where an in-place change measured about 7 ms.

  Nothing moves with `shellFrameDelta` off (the default), for a terminal that did not ask for deltas, or on a canvas whose frames are at most 64 KB: those are byte for byte what they were. The rendered tree is the same in every case.

  **What to change:** nothing. With deltas on, a change to a canvas over 64 KB now costs that canvas's whole frame on the wire — what a terminal that never asked for deltas is sent — where it had cost a delta, after the encode.

- a91b5db: `migrateTables`: the step that changes the tables, and checks the app's entries against what it leaves before it commits. `runtime.tables` hands it the app's own.

  A deployment whose runtime says `migrations: 'verify'` refuses to start with anything pending, and moss had nothing to run first. An app's own tables were outside that run, so `'verify'` did not cover them.

  `runtime.tables` takes the app's own table sequences (and another owner's the app keeps — tide's `TIDE_SEQUENCE`). They join moss's one ledgered run, after moss's own. A runtime that hands tables over does not also migrate them itself.

  `migrateTables(runtime, app, { dryRun? })` applies everything pending in that run and, before it may commit, checks every entry of the manifest against the schema as it would stand: a read is resolved, a write is put to the gates it passes before it runs (vex's `mutationMisfits`). An entry that does not fit refuses the run — strata's `DOES_NOT_FIT`, each reason as `fingerprint: why` — and nothing is applied. It checks when nothing was pending too, so a release that changes an entry and no table is checked.

  One kind of entry is listed and not refused: one that already did not fit before the run and that the database already holds seeded exactly as it is. A new or changed entry gets no such pass. The report also says which tables and columns a run removed and which column types it changed.

  It sees entries and nothing else: not SQL written by hand, not a column a scope rule stamps, not what a value means.

  **What to change:** nothing. A boot applies and verifies exactly what it did: a runtime without `tables` runs the same sequences in the same order.

- 812c464: `runtime.vexConfig` hands the query engine its settings.

  Moss built the vex engine with no `config`, so a deployment ran on vex's defaults — 100 rows for a list that states no limit, 1000 at most, a ten-second read timeout — and had no way to change one.

  `NiscRuntime` takes an optional `vexConfig`, passed to `createQueryEngine` as its `config` unread: `defaultLimit`, `maxLimit`, `capAuthored`, `statementTimeoutMs` and the rest of `QueryEngineConfig['config']`. Unset, the engine is built exactly as before.

  **What to change:** nothing. Set `vexConfig` in your runtime to change one of the engine's numbers — for example `vexConfig: { capAuthored: true }` to keep seeded entries under `maxLimit`.

- 770f754: A frame the websocket transport refuses closes that connection; it no longer ends the process.

  `attachSocket` listened for a connection's messages and its close, and not for its errors. `ws` reports what it refuses from a client — a malformed frame, text that is not UTF-8, a message over its size limit — as an `error` on that connection, and Node throws an `error` nobody listens for. So one such frame, from any client that could open the socket, signed in or not, ended the server process and every session on it. The transport now listens: `ws` has already closed the connection with the status that says why (1002, 1007, 1009), one line is logged (`[moss/node] a connection was closed on what it sent: …`), and nothing else is touched. Every host that calls `attachSocket` gets it — `serve`, `nisc start`, the vite plugin, an app's own listener.

  **What to change:** nothing. An app this had happened to was not running. A process-level `uncaughtException` handler that was catching these no longer hears them.

- 61a4060: A sign-in made over the socket no longer hands the page its token. It reaches the page sealed, and only that browser can open it.

  `session.grant(token)` happens on a socket, and a socket cannot write a cookie — so the token has to travel through the page to the terminal's next upgrade, where the session cookie is written. It used to travel as itself, which for that moment put it where any script in the page could take it. Now it travels encrypted with a key the browser holds in a second cookie no script can read (the _seal_), given by the answer to the browser's first upgrade. The page hands the sealed sign-in back and cannot open it; neither can anybody it is shown to, on this machine or another — without that browser's seal it opens nothing, and after a minute it opens nothing at all.

  **The setup this stops working for:** none that worked. What is new for a browser: a terminal on `browserEnv()` now names `sealed=1` in the socket's address, and a browser that opens a socket to its app is given one more cookie — `nisc.seal` (`__Http-nisc.seal` over https): `HttpOnly`, `SameSite=Lax`, sent with the socket's path and no other, kept until the browser closes. It is given whether or not anybody signs in. It is a key, not a name: it is not stored or looked up on the server, and no page request carries it, so a page drawn for nobody stays cacheable for everybody.
  - **Any credential, any number of processes.** Nothing is kept on the server between the sign-in and the upgrade that completes it, so it does not matter which process answers either, and the token can be moss's own or an app's provider's.
  - **Terminals that keep their own token are handed it as before:** a process on `nodeEnv`, a page served from another origin, a `WireEnv` without `tokens.held`, a transport that cannot answer an upgrade late. `{ type: 'session', token }` is unchanged for them.
  - **A browser that does not keep the seal** — it sends none back with the sealed sign-in — is told (`seal_not_kept`); its terminal stops asking, and the next sign-in reaches it as a token. That costs such a browser one failed sign-in.
  - **A terminal written by hand** that wants sealed sign-ins: `?sealed=1` on the address from the app's own origin; a `{ type: 'session', sealed }` message is offered back with `offerToken(null, sealed)`.

  The seal's name over https is what keeps a script from supplying it: the seal is given after the page's script has started, and a script already running then could otherwise set one of its own first and open the sign-in that follows. `__Http-` is a name a browser lets only an HTTP answer set. Not closed: a browser that does not know that prefix treats it as any other name; and a server on a sibling subdomain can still set one, which with a script in the page as well is the same opening.

  **What to change:** nothing.

- 8012cd8: A message a terminal sends over the socket is at most 256 KB; a host that takes larger ones says so with `attachSocket`'s new `maxMessageBytes`.

  **The setup this stops working for:** an app whose terminal sends a message over 256 KB — in practice a file put into a model value as base64 (a picked picture is megabytes). That message now closes the connection with `1009` and what it carried does not arrive; the terminal reconnects as after any other close, and a signed-in person's shell is as it was. To keep the old behaviour, a host that calls `attachSocket` passes the size it takes: `attachSocket(httpServer, server.socket, '/socket', { maxMessageBytes: 100 * 1024 * 1024 })` is what `ws` did before. `serve()`, `nisc start` and the vite plugin take the default and cannot raise it; an app on one of those that needs more attaches the socket itself. Better than raising it, and what `AGENTS.md` rule 9a says: a file never goes over the socket — the picker sends it to a route the app mounts, and the event carries what the route answered.

  Why there is a limit. `attachSocket` created its `WebSocketServer` with no `maxPayload`, so the limit was `ws`'s own 100 MiB. Whatever a message carries, the server keeps — the value in the shell, and again in the last frame it sent — and sends back down in every later frame of that canvas. So the limit is what one connection, signed in or not, can make the process hold and re-send. Measured per open connection: 0.2 MB with nothing sent, 1.5 MB after a 256 KB value, 3.3 MB after 1 MiB, 48 MB after 16 MiB. Compression does not bound it — a 64 MB message of one repeated letter is 60 KB on the wire — so the count is of the message once inflated. What a terminal legitimately sends is an event: a press, a typed value, a row handed back. A few KB.

  **What to change:** nothing, unless a terminal of yours sends more than 256 KB in one message — then one of the two things above. A typed value still has about 250,000 characters of room.

- 10875eb: A terminal's session token no longer rides the socket's address. It is offered in a header of the same request, and a token in the address is not read.

  **The setup this stops working for:** a terminal and a server that are not the same version. The wire protocol is now 2 and the server speaks nothing older, so a terminal built before this is refused with `client_too_old` and a `4426` close — the existing "reload to get the current build" path — and a terminal built after it is refused by an older server with `server_too_old`. An app's terminal and server are one package and deploy together, so in practice this is a tab left open across the deploy: it reloads once. Three things written by hand also change:
  - **A terminal written by hand** (`new WebSocket(`…/socket?token=…`)`, as a check or a script does) names the protocol and offers the token: `new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token))`. `PROTOCOL` and `offerToken` are exported from `@niscorp/moss`; `offerToken(null)` is a terminal that is nobody.
  - **A `WireEnv` of your own**: `socket` takes `{ url, offered }` where it took `url`, and constructs `new WebSocket(url, offered)`. One argument on purpose — an env that kept the old shape would have gone on compiling and connected everybody as nobody; this way it does not compile.
  - **A transport of your own** (anything that is not `attachSocket`) hands over what the request offered: `connection.upgrade = { offered }`, the `Sec-WebSocket-Protocol` header split on commas, and answers the subprotocol `nisc`. Without it every terminal is served as nobody.

  Why. The token rode the upgrade's query string, and an address is what every proxy, load balancer and access log between a browser and the app writes down. The request has one header every host lets a terminal set, a browser included: the subprotocols it offers. So the terminal offers `nisc`, and beside it its token, base64url (a subprotocol is an HTTP token; a session token need not be); the server answers `nisc` and never the other. Who a terminal is is still decided on the upgrade request, before anything is served, so there is no connection that is open and waiting to be told. A server that kept reading `?token=` for older terminals would have kept the address open for as long as anything used it, which is why protocol 1 is refused rather than served.

  **What to change:** nothing in an app that uses `createWire` with `browserEnv()` or `nodeEnv()` and serves with `serve`, `nisc start`, the vite plugin or `attachSocket`. Otherwise one of the three above. Anything that read `?token=` off the socket's address — a proxy rule, a check — no longer finds it there.

- fc50d20: `AGENTS.md` says where files go. Rule 9a: file pickers live in the kit; a file never goes over the socket; the app saves it wherever it wants. The review pass's "no `fetch` outside the endpoint layer" gains its one exception, to send a file. No code changed.

  A picker that puts a file in its model value sends it over the socket as base64, and the tree brings it back on every render of that canvas. Measured against a moss server: one 15 MB file was 20 MB up and 100 MB down across five renders. Sent by the picker to a route the app mounts on its server, or to a system the app already has, the same file put nothing on the socket.

  moss gains a test and nothing else: a route an app adds to the built server reads who is asking, as moss's own surfaces do.

  **What to change:** nothing for the rule itself. But this release also limits a message a terminal sends to 256 KB (the moss entry on the socket's message limit), so a picker that emits a file's bytes as its model value now works only for a file under about 190 KB: send the file from the picker, as rule 9a says, or raise the limit where the app attaches the socket.

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
