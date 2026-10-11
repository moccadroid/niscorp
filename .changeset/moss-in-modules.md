---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss is rebuilt as modules, and its public API is what an app is meant to call. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-09: import only what `@niscorp/moss` still exports (the list is `packages/moss/api.txt`); the changes an app has to make are listed below, one per part.

Moss had grown to twenty-eight files flat in `src/`, one of them a single function of 1,345 lines, and it exported 135 names of which 71 were imported by nothing outside the package. `docs/plans/moss-refactor.md` is the audit and the plan.

**How to read this.** The parts are in eight groups, in the order an app meets them: (1) what is imported from where, (2) the manifest, (3) the session and who is calling, (4) integrations, (5) a write and tide, (6) the socket and the shells, (7) pages and the Node entry, (8) the terminal. Each part says what changed and what an app writes instead, and a part that asks nothing of an app says so. The last part, "What an app changes", is the list to work down.

**(1) WHAT IS IMPORTED FROM WHERE**

**The main entry exports 49 names, not 135. All sixteen entries together export 103, where fourteen exported 185.**

90 names left the main entry and four arrived (`Feature`, `FeatureSeams`, `verifyApp`, `ManifestReport`). Every name that left is in this table, with what to write instead.

| Was imported from `@niscorp/moss` | Write instead |
| --- | --- |
| `createAssertionSigner`, `integrationOfAction`, the types `StorePress`, `CallIntegration` | the same name, from `@niscorp/moss/integrations` |
| `createTideStore`, `TIDE_SEQUENCE`, `TIDE_TABLES`, `TIDE_DDL`, the type `TideStoreOptions` | the same name, from `@niscorp/tide/postgres` |
| `createTideDriver`, the types `TideDriver`, `TideDriverConfig` | the same name, from `@niscorp/tide` |
| the type `FactIntake` | the same name, from `@niscorp/moss/tide` |
| `listAttachments(pool, hostAction)`, `listPlacements(pool)`, `integrationByKey(pool, key)` | `integrations.listAttachments(hostAction)`, `integrations.listPlacements()`, `integrations.integrationByKey(key)`, on the object `createIntegrations` answers ("Integrations are a feature", below) |
| `callIntegrationWith` | `integrations.callIntegration(id, path, init)` |
| `listIntegrations(pool)`, the type `IntegrationRow` | `GET /operator/integrations` with the operator key answers `{ integrations }` |
| `describePlacements` | `adds` on each integration of that list |
| `buildContract`, `contractAsMarkdown`, the type `Contract` | `GET /api/integrations/contract`, and the same with `?format=md` |
| `runIntake`, `copyPress`, `initIntegrations`, the types `Bundle`, `IntakeContext`, `IntakeResult`, `PressResult` | nothing to call. Registering an integration (`POST /operator/integrations`) runs intake and copies the press, and `createServer` and `migrateTables` create the tables |
| `mintIntegrationKey`, `hashIntegrationKey` | nothing to call. A key is minted when an integration is registered and answered once; `integrations.integrationByKey(key)` says whose a key is |
| `verifyAssertion`, the type `Assertion` | an integration's service verifies an assertion itself. The token is `<body>.<signature>`, both base64url; the signature is ed25519 over the body's bytes, under the key `GET /api/integrations/verify-key` answers (SPKI DER, base64); the body is JSON, `{ integration, principal, scope, iat, exp }` |
| the type `AssertionSigner` | `ReturnType<typeof createAssertionSigner>` |
| `resolveCatalog(app, principal)` | `(await server.catalogOf(principal)).ids` |
| `resolveCatalogForRoles(app, roles, installed)`, `filterInstalled` | `server.catalogForRoles(roles, installed).ids` |
| the type `Catalog` | `Awaited<ReturnType<MossServer['catalogOf']>>` |
| `resolvePolicyForRoles(app, grants, roles)` | `server.policyForRoles(roles)` |
| `resolvePolicyAtReach` | nothing to call. The routes and `server.executeAs` serve an entry at the reach it declares: replay the entry |
| `resolveVariantsForRoles(app, roles)` | `resolveVariants({ charter, layouts, assignments: { someone: roles } }, 'someone')` |
| `auditClosure`, `wearableOf`, `verifyVariants` | `server.charterReport()` for what a server is serving, `server.verifyActions(source, actions)` for a set it has not taken, `verifyApp(app, grants)` where there is no server |
| `loadIntegrationActions` | `server.actions()` |
| `memoKeyOf(app, principal)` | nothing to call: it was the key of memos nothing outside the server can address. To learn whether two principals are served the same application, compare `(await server.catalogOf(principal)).hash` |
| `createShellHost`, the types `ShellSession`, `ShellOpening`, `ShellReport` | `server.shells`, and `server.page(path)?.host` for a page. The types are `Awaited<ReturnType<ShellHost['session']>>`, `Parameters<ShellHost['session']>[2]` and `ReturnType<ShellHost['list']>[number]` |
| `shellNeedOf`, the type `ShellNeed` | `live` and `why` on what `shells.snapshot(token, principal)` answers; for a build, on each result of `exportDocuments` |
| `createSocket`, the types `SocketAccept`, `SocketContext` | `server.socket`, whose type is `MossServer['socket']` |
| the type `ClientMessage` | not exported. The six messages a terminal sends are listed under "A message on the socket", below |
| `CLOSE_SHELL_FAILED` | the number, `4500` |
| `createDataLayer`, the type `DataLayer` | nothing to call: `createServer` stands the data layer up. `server.executeAs` replays an entry as a charter role, and `session.answerIntent` runs a query written for an intent |
| `createGeneration`, `GENERATION_DDL`, `DEFAULT_GENERATION_POLL_MS`, the type `Generation` | `server.generation()` reads the counter; `server.refresh()` and `server.replaceActions` move it. Its table is part of `MOSS_SEQUENCE`, and it is polled every `runtime.sessionRevalidateMs` (60 seconds when unset) |
| `createIdentityCache`, `DEFAULT_IDENTITY_MAX`, `DEFAULT_IDENTITY_IDLE_MS`, the types `IdentityCache`, `IdentityCacheContext` | declare `identity` on the manifest. The limits are `runtime.identityMax` (10,000 when unset) and `runtime.identityIdleMs` (30 minutes); `server.invalidateIdentity`, `server.invalidateTenant` and `server.identities` are the rest |
| the type `IdentityReport` | `ReturnType<NonNullable<MossServer['identities']>['list']>[number]` |
| `DEFAULT_IDLE_MS`, `DEFAULT_REVALIDATE_MS` | the settings they were the defaults of: `runtime.shellIdleMs` (30 minutes when unset), `runtime.sessionRevalidateMs` (60 seconds) |
| `devSession` | `session: 'dev-open'` ("The dev verifier is not exported", below) |
| `sessionVerifierOf(runtime)` | `server.principalOf(token)` |
| the type `SessionVerifier` | `Exclude<NiscRuntime['session'], string>` |
| `revokeSession(pool, token)` | `revokeAllFor(pool, principal)`, or `session.revoke()` in a function: both sign the principal out everywhere. No exported call deletes one token and leaves the principal's others |
| `SESSIONS_SEQUENCE` | `initSessions(pool)` runs it |
| `wireFabric`, the types `Fabric`, `FabricSignal`, `FabricMessage`, `FabricApply` | set `runtime.fabric`. Its type is `NonNullable<NiscRuntime['fabric']>`, and a message is what its `publish` is handed |
| `emitterOf`, `spanClock`, the types `Emit`, `SpanClock` | nothing to call. A sink goes in `runtime.telemetry` (`Telemetry`), and moss catches what it throws |
| `mintWrites` | name `createTideFacts(...)` in `features` ("Tide's hosting is tide's", below) |
| `SNAPSHOT_ELEMENT_ID` | `readDocumentSnapshot()` reads the element and `embedSnapshot` writes it. Its id is `nisc-snapshot` |
| the types `PageRouter`, `PageMatch` | `ReturnType<typeof createPageRouter>`, and what its `match` answers |

Where the right column says there is nothing to call and an app did call it, say which and why in an issue: the answer is a call that is meant to be public, not the name coming back.

**Integrations are a feature: `@niscorp/moss/integrations`, named in `features`.**

- Integrations (services that add screens: registration and approval, the proxy, frames, webhooks, the integration key) are not part of moss's core any more. They ship from an entry point of their own, and an app that uses them creates the feature and names it in its manifest:

  ```ts
  import { createIntegrations } from '@niscorp/moss/integrations';

  const integrations = createIntegrations({ integrationActor, attachable, menuSlots, placementNames, storePress });
  const app = defineApp({ charter, actions, features: [integrations] });
  ```

- **Nine fields leave `NiscApp`.** Eight are the configuration of `createIntegrations`, under the names they had: `integrationActor`, `attachable`, `menuSlots`, `assistantTools`, `publishChecks`, `editorRegions`, `placementNames`, `storePress`. The ninth, `installedIntegrations`, was deprecated and never called, and is gone. A manifest that still names one of the nine is refused at boot, as any field the type does not have is: `(the manifest): Unrecognized key: "menuSlots"`. An app that read one of the eight back off its own manifest (`app.attachable`) keeps the value where it creates the feature.
- `NiscApp.features?: readonly Feature[]` is new. The server starts each feature, in order, once its core stands and before anything is served.
- **An app that does not name the feature has no integrations.** None of `/api/integrations/*`, `/integrations/:id/*` and `/operator/integrations` is served, an `ik_` key is read as a session token and refused as one (`invalid_token`), and no integration's actions are loaded. The tables are still created; rows in them are not served.
- **Each call that moved is on the object `createIntegrations` returned**, and takes no pool: `integrations.callIntegration(id, path, init)` (`MossServer.callIntegration` is gone), `integrations.listAttachments(hostAction)`, `integrations.listPlacements()`, `integrations.integrationByKey(key)`, `integrations.integrationOfAction(id)`. They work once `createServer` has answered. Before that the four that read rows reject with a sentence that says so.
- New from the entry: `createIntegrations` and the types `Integrations` and `IntegrationsConfig`.
- `app.actions` is what the app shipped, and stays it. Moss wrote the integrations' actions into that record; it no longer does. Code that read them there reads `server.actions()`.

**Tide's hosting is tide's: the store and the driver ship from tide, and the write-fact bridge is a feature, `@niscorp/moss/tide`.**

- Moss held a Postgres store that implements tide's store contract, and a driver that paces tide. They are tide's storage and tide's pacing, and every moss app installed `@niscorp/tide` because of them. Both are in tide now (the tide changeset), under the names they had, and each is called as it was: `createTideStore(runtime.pool)` takes the pool it took.
- **The tables are the ones the database has.** `TIDE_SEQUENCE` is the same sequence under the same id, `nisc.moss.tide`, with the same migrations in the same order. A deployment that ran it finds nothing pending.
- **`@niscorp/tide` is an optional peer of moss.** An app that runs no tide does not install it, and nothing in moss's main entry imports it. An app that uses `@niscorp/tide/postgres` has `@niscorp/strata` installed, which every moss app does.
- **`NiscApp.facts` is gone: minting a write into tide is a feature.** An app that did it creates the feature and names it in its manifest:

  ```ts
  import { createTideFacts } from '@niscorp/moss/tide';

  const app = defineApp({ charter, actions, features: [createTideFacts({ tide: () => driver, identity, chain })] });
  ```

  `tide`, `identity` and `chain` are the three functions `facts` held, under the names they had, and each is asked what it was asked. A manifest that still names `facts` is refused at boot: `(the manifest): Unrecognized key: "facts"`.
- **An app that does not name the feature mints nothing.** No write becomes a fact, and a reflex with a `write` trigger is never woken by one.
- A write is told to the features that hear writes, in the order the app named them, and then to `reactions`. That is the order it was told in while the bridge was part of the server.
- New from `@niscorp/moss/tide`: `createTideFacts`, and the types `TideFactsConfig` and `FactIntake`.

**The client and terminal entries export what an app calls: six names leave.**

- `@niscorp/moss/client` loses `SNAPSHOT_ELEMENT_ID` and the type `WireTokenStore`. The id is read by `readDocumentSnapshot()` and written by `embedSnapshot` (main entry): call those. The type is `WireEnv['tokens']`.
- `@niscorp/moss/terminal/react` loses `registerWireSlots` and the type `WireSlotOptions`. `reactTarget`, `renderSnapshot` (`/terminal/react/server`) and `inkTarget` register the wire slots on the registry they are handed: call one of those. A kit that wants its own element around a canvas wraps the slot moss registered, read back with `registry.get('CanvasSlot')` once the target is made, as lyceum's does.
- `@niscorp/moss/terminal/vue` loses `registerWireSlots` and `terminalFrame`: `vueTarget` and `renderSnapshot` (`/terminal/vue/server`) are the two things they were for.
- Nothing in this repository imported any of the six.

**(2) THE MANIFEST**

**The manifest is parsed and frozen when it is handed over.**

- `createServer(app, runtime)` parses the manifest before anything else uses it, and a manifest that does not parse refuses the boot with `The manifest does not parse — refusing to serve:` and one line for each place that does not fit (`actions.home: Unrecognized key: "tittle"`, `shell.inputs: expected a function`). It used to be used as it stood: a definition nova refuses was found when a shell that holds it was built, for whoever connected first, and a seam that was not a function when it was first called.
- An action, a fragment and a layout are read by nova's schemas, an entry's `dsl` and `mutation` by vex's, its `mapping` by Prism's, `grammars` by strata's. Every other data field is held to the shape `NiscApp` gives it, and a code seam to being a function.
- A field the type does not have is refused, on the manifest itself, on the shell or a page, on a canvas, a layout variant, an entry, a reaction, `identity` and `phraseKeys`. The compiler already refuses one written in place; one that arrived through a spread or a cast used to be carried and ignored. An app that kept something of its own there keeps it beside the manifest. A component's contract (`shell.components`) and a resource written as an object may still carry more than moss names.
- An app whose manifest is typed as `NiscApp`, with no cast and no extra field on the way, has nothing to change for the parse.
- Then `createServer` freezes the manifest, every level of it, in place. Once it has returned, an edit throws a `TypeError` where it is written: `app.actions.x = …`, `delete app.actions.x`, `app.actions = …`, `app.charter.role = …`, `app.entries.push(…)`, a write to a definition, a layout node, a canvas or a variant. A function and an instance of a class (a zod schema a kit handed over as a component's props) are not frozen and not looked inside. Before `createServer` is called nothing is frozen: `defineApp` returns its argument, and an app may go on assembling it.
- An edit to the charter, the behaviors or the layout variants used to be half served: it reached whoever was resolved next and nobody already resolved, and no check had seen it until a `refresh`. An entry added to `app.entries` after boot was never seeded.
- **What an app does instead.** Actions that arrive while it runs are handed over as a set, with `server.replaceActions` (next part). A charter, a layout variant, an entry, a behavior and the shell do not change while a server runs: they change in the manifest the next server is created with.
- An object the app shares between its manifest and its own code is frozen for both: code that wrote to one writes to a copy of its own. The checks of the five lab apps (lyceum, lyra, atrium, relay, encore) ran against the frozen manifest and none of them hit one, in the app, in moss or in nova.

**`server.replaceActions(source, actions)`: an app hands over the actions it loads from rows.**

- New. An app that loads actions from its own tables hands them over: `server.replaceActions('bundles', actions)`. The name is the app's; handing the same name over again puts the new set in place of the old, so an action it no longer names leaves. The actions in force are what the app shipped, then each set. `'integrations'` is the name of the integrations feature's set, read from its tables.
- What the app would then consist of is verified first, and every definition of the set is read by nova's schema before that. Refused, the call throws and nothing changed: not the actions being served, not what any role holds, not the record that was handed in. The sentence is the one `refresh` throws, or `Refresh refused — actions nova does not read:` with the action and what is wrong with it. Accepted, it does what `refresh` does in the process it was called in: memos are dropped and every living shell adopts; and the set is frozen, so it is changed by handing over another of the same name.
- **The set is handed to one process, and no other process is handed it.** The call moves the generation pointer, and every other process on the same database follows the pointer within one poll (`sessionRevalidateMs`, 60 seconds when unset): it reads again each set of actions it has a loader for, runs the same check over what it would then serve, drops what it derived, and has its living shells adopt. That is all the pointer carries. A set that reached a process through `replaceActions` alone is in that process's memory: every other process reaches the same generation and goes on serving the set of that name it was last handed itself, or none.
- **An app that runs several processes keeps such a set in rows and says how it is read, in a feature of its own.** In the feature's `start`: `seams.loadActionsFrom(source, load)`, and `seams.replaceActions(source, await load())` for what the rows hold when the process starts. The process that changes the rows then calls `server.replaceActions(source, await load())`; every other process reads the rows through its loader within one poll, and serves them. That is how the integrations feature's set, `'integrations'`, crosses processes. An app that names no loader hands the set over in each of its processes itself, on a signal of its own; each call moves the pointer once more, and the others drop what they derived and adopt again.
- Editing `app.actions` and calling `refresh()` is gone. The edit throws, and `refresh` ships nothing: it verifies what is in force again, drops what was derived from it and has living shells adopt, which is what a changed role or install needs.
- An app whose sets are `ActionDefinition`s nova reads has nothing more to change. One that handed over a definition with a field nova does not have corrects the definition: it used to be served, and was found when a shell that holds it was built.

**A server answers what somebody holds, which actions are in force, what a set of roles may read, and whether a set would be taken.**

- New on `MossServer`: `catalogOf(principal)` and `catalogForRoles(roles, installed?)` answer `{ ids, hash }` from the actions in force; `actions()` is the actions in force, by id; `policyForRoles(roles)` is the vex policy a request by somebody holding exactly those roles is served under; `verifyActions(source, actions)` is the dry run of `replaceActions`, answered as a report, changing nothing.
- New in the main entry: `verifyApp(app, grants)`, the check boot runs for an app that is not booted, and the type of its report, `ManifestReport`: `{ errors, said, charter }`. `errors[].check` is one of `'actions'`, `'charter'`, `'reach'`, `'variants'`. `report.charter` is what `verifyCharter` answered, closure issues included, and `report.errors.filter((error) => error.check === 'variants')` is what `verifyVariants` returned.
- These are what the functions they replace should have been. `resolveCatalog` read `assignments` and nothing else, so in an app that resolves people through `identity` it answered as `public` for everybody the assignments did not name; the server resolves who somebody is the way a request does. `resolvePolicyForRoles` compiled from whatever manifest and whatever list of grants it was handed, so a check that wrote the grants down itself read a policy no request was served under; the server compiles from the charter and the `behaviors` in force, over every table the database has. What `policyForRoles` answers is compiled for the asking and is the caller's own: nothing done to it reaches a request.
- Three functions that read `assignments` only are still exported, for a tool with a manifest and no server: `resolveRoles`, `resolvePolicy`, `resolveVariants`. With a server, ask the server.
- Code running in a session that wants what its own caller holds asks `GET /catalog` over the session's wire, as before.

**`refresh` runs the check boot runs.**

- `refresh()` ran a shorter copy of the boot check: the charter and the layout variants. It is now the same verification as boot's, entries' `reach` included. It verifies what is in force, and what is in force was verified when it was taken, so an app sees no difference.
- A boot that is refused prints the chains of steps that never end before it throws. It printed them only when the charter had passed.
- **A boot the check refuses has seeded no entry.** The app's entries were written into `vex_cache` before the check ran, so a manifest that was refused had already written its rows. They are seeded once the check has passed, by the same seeding, into the same table. A manifest that fails both the check and vex's lint of a write (`Mutation seed "…" fails the authoring lint`) is refused with the check's sentence, where it was refused with the lint's; corrected, the next boot says the other. An app that boots has nothing to change.

**The generation counter is read and moved through vex, and a change another process made is followed, or tried again.**

- Every process polls one row, `moss_generation`, to learn that another changed what the app consists of. It was read and moved by statements sent to the pool: the last SQL in moss with no reason to be outside vex. It is two entries of moss's own now, replayed in process under a policy that admits that one table. No route serves them, and no charter has to grant them. A role granted a data wildcard still denies `moss_generation.*` (AGENTS.md, rule 10a).
- A move is a compare and a set. Vex's write grammar sets a column to a value and reads none, so it cannot add one: the counter is read, and the next number is written where the counter is still what was read. Where it is not, another process moved it in that instant, and it is read again. A counter that could not be moved after five tries in a row is logged (`[moss:generation] could not move the pointer`). A row somebody deleted used to be moved without a word, and nothing was moved.
- The counter is moved through `runtime.db`, the client every write is replayed on. It was `runtime.pool`. An app whose `db` and `pool` reach one database, which is every app there is, sees no difference. No span is emitted for the counter's reads and moves, as none was.
- When the pointer moves, a process reads again the sets of actions it has a loader for: the ones a feature keeps in rows and named with `loadActionsFrom`. A set it was handed with no loader stays what it was handed ("`server.replaceActions`", above). When that reading failed (the database out of reach for a moment, a set this process refuses), the move was counted as seen all the same: the process went on serving what it had until the pointer moved again, and its log said the pointer `could not be read`, which it had been. A move is counted as seen once it has been followed. One that could not be is logged as that (`the generation pointer moved (3 → 4) and this process could not follow it: …`), and is tried again at the next poll (`sessionRevalidateMs`), and the one after, until it is. It is logged when it is news, not at every poll: when it first fails, again when the pointer has moved on or the reload fails another way, and once when it is followed (`followed the generation pointer to 4, after 12 looks that failed`).
- A process that moves the pointer itself counted the number its own move landed on as seen. When another process had moved the pointer first and no poll had come between, what the other one changed was never read here. Its own move is counted as seen only when nothing else is waiting to be followed; otherwise the next poll follows both. `server.generation()` answers the last generation this process followed.
- An app has nothing to change.

**A page whose path names one parameter twice refuses the boot.**

- `path: '/docs/:id/versions/:id'` was accepted, and the canvas its parameters go to was handed one `id`: the later segment's. The first was matched and lost. `createServer` and `createPageRouter` refuse it now: `moss: page "…" names the parameter ":id" twice in "…" — give each parameter of a path its own name.`
- An app with such a path names the second parameter something else. No lab app has one.

**(3) THE SESSION, AND WHO IS CALLING**

**`FunctionSession` carries no `runtime` and no `policy`.**

- The session an app's `functions` and `onSession` are handed loses two fields. `runtime` was the whole environment: the database pool, the operator key, the signing seed. `policy` was the object the routes enforce for everybody holding those roles. Code that runs for one person was handed what reaches every person's rows, and the one object whose edit would change what the routes allow. A session now says who is calling (`principal`, `roles`, `identity`, `actions`), lends `wire`, `grant`, `revoke`, `recordRun`, and one call that is new.
- **New: `session.answerIntent(writers, asked)`**, for an app that lets a model write a query. `writers` is vex's two seams, `{ generateDsl, mapToShape }`; `asked` is `{ intent, shape, context? }`. The query is written, compiled and run under the policy and the scope values the routes serve the session's principal under, resolved when it is asked, and kept in the cache the routes replay from: `answer.meta.cache.fingerprint` replays over `session.wire` afterwards. It rejects with what vex throws (`code: 'unsatisfiable'`, `'scope_denied'`). Moss keeps one engine for each `writers` object, so hand over the same object each time.
- **What an app calls instead.**
  - It built a second vex engine from `session.runtime.pool` and `session.runtime.cache` and executed with `scopePolicy: session.policy` → `await session.answerIntent({ generateDsl, mapToShape }, { intent, shape })`. Moss builds that engine over its own adapter and cache, with the app's `behaviors` and `runtime.vexConfig`, and hands neither out.
  - It read `session.policy` to know what the caller may read (which feeds, which stored queries to offer) → `server.policyForRoles(session.roles)`.
  - It read `session.runtime` for its own database (minting a session for somebody else, a sync, a raw statement of the deployment's own) → the runtime the app created and handed to `createServer`, closed over where the app builds its manifest. Moss does not hand it back.
- A read or a write as the caller is `session.wire`, as before.

**The dev verifier is not exported, and a verifier of the app's own is named at boot.**

- `devSession` is gone from the main entry. It trusts any token that carries a `sub`, and passed as `session: devSession` it booted without the line `session: 'dev-open'` prints. An app that imported it sets `session: 'dev-open'`, which is the same verifier and says so at boot. A check that wrapped it to make a token expire keeps a map of the tokens it issued instead. `mintDevToken` stays.
- A `session` that is a function prints one line at boot: `[moss] session: a function the app supplied (name) decides who a token is.` Nothing about the verifier changes, and an app has nothing to do.

**The record `identity.resolve` answers is read by a schema.**

- `roles` is a list of strings, `scope` an object, `installed` (when there) a list of strings, `tag` (when there) a string. A record that does not fit is refused with a sentence that names the field, and nothing is held for that principal: a request whose principal resolves to such a record is answered `500` `identity_failed` (next part). It used to be carried on as it was, and failed later, somewhere else, or not at all.
- What is inside `scope` is not looked at, and a field moss does not name stays on the record the `scope` hook is handed.
- An app whose `resolve` returns an `IdentityRecord` has nothing to change.

**A failure to find out who is calling is `500 identity_failed`, and is logged. It was `401`, and silent.**

- Every HTTP request is identified once, at the door. A token the verifier says is nobody's is a failed sign-in, and is answered `401` `invalid_token`, as before.
- Anything that *threw* while the server found out who is calling was answered `401` `no_identity` too, with nothing in the log: the database being down, the app's `identity.resolve` throwing, an identity record that does not parse. A client that drops its session on a `401` dropped it over a fault of the server's. It is answered `500` `{ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }` now, and the error is logged. None of its text is sent.
- The same answer where the throw used to reach Hono's own handler and came back as the text `Internal Server Error`: a `session` verifier that throws, and a feature's credential (an integration key) that cannot be read or whose principal cannot be resolved.
- **`no_identity` is gone.** An app whose `identity.resolve` throws for a principal it does not know answers a record for nobody instead (`{ roles: ['public'], scope: {} }`), as lyra and lyceum do, or has its `session` verifier answer `null` for the token. Code that matched on `401` `no_identity` matches on `500` `identity_failed`.
- The socket is as it was: a session that cannot be opened is `session_failed` and a `4500` close.

**`runtime.identityMax` of zero or less refuses the boot.**

- With an `identity` seam declared, `identityMax: 0` (or less) used to boot and then hang the process on the first sign-in: making room in a cache that has none never ended. `createServer` now refuses it with a sentence that names the setting. Give it 1 or more, or leave it unset for the default of 10,000.

**An identity that is forgotten stays forgotten.**

- `invalidateIdentity`, `invalidateTenant` and `refresh` forget what moss holds of a principal. A record that was being resolved while one of them ran used to be held when it landed, so a role change or an install made at that moment was not seen until the record expired by itself (`sessionRevalidateMs`). It is now handed to whoever was waiting for it and not held. An app has nothing to change.

**What a fabric's transport hands over is read by a schema.**

- `runtime.fabric` carries three signals between the processes of one deployment. What its `subscribe` handed back was used as the type said it was: a message from another process, off a wire that is the host's, was switched on unread, and a `principal` that was not a string reached the identity cache as it came. It is parsed now: the object moss published, with exactly its fields. What does not parse is dropped, and the first one is logged with what was wrong with it and nothing it carried (`[moss:fabric] the transport handed over what is not a message…`).
- The applier `subscribe` is handed takes `unknown` where it took a `FabricMessage`: a transport passes on what `JSON.parse` answered and casts nothing. A transport typed against the old applier still compiles.
- **A transport that hands the message over as it was published has nothing to change.** One that handed over the text it received parses it first; one that added a field of its own to moss's message carries that field beside the message, not in it.

**(4) INTEGRATIONS**

**Integrations read and write through vex, and a feature is handed no pool.**

- Every statement integrations ran on `integrations` and `integration_actions` is a vex entry now, replayed in process. The audit counted 28 statements in moss with no reason to be outside vex, 24 of them on those two tables; none is left (the generation counter's four went last), and `pnpm check:raw-sql` holds the count at zero.
- The entries are the feature's own. They are seeded into a cache no route serves, so `/api/vex` answers `cache_miss` for one of them whatever the charter grants whoever asks, and they run under a policy that admits the feature's tables and nothing else. A data grant on `integrations` opens no approval and no registration: those stay behind the operator key.
- `FeatureSeams` has no `pool`. A feature of an app's own hands its reads and writes over as entries and replays them: `const replay = await seams.ownEntries(entries)`, then `await replay(fingerprint, context)`.
- `Feature.tables?: { names: readonly string[]; sequences?: readonly Sequence[] }` is new. `names` is the tables that are the feature's own; `sequences` is the strata sequences that make them, which the server migrates in the one ledgered run, after moss's own and before `runtime.tables`, and `migrateTables` (`nisc migrate`) runs too.
- **A feature's own entries reach the tables it named on itself, and no other.** They run outside the charter, under a policy that admits those tables alone, so which tables they are is read off the feature before it runs and is not something it says when it hands entries over. An entry that reads or writes any other table refuses the hand-over, and with it the boot: `moss: the feature "…" handed over an entry that reads or writes a table that is not its own: "…"`. What an app's table holds, a feature reads as the app does: through the app's entries, under the charter.
- **A table has one owner.** A feature that names one of the core's tables as its own (`sessions`, `moss_generation`, `vex_cache`, `strata_ledger`) refuses the boot and `migrateTables`, with the table and what it holds; so do two features that name one table, and two features of one name. `integrations` and `integration_actions` are made by `nisc.moss`, where every deployment's ledger has them, and are the integrations feature's: it names them, with `integration_frame_grants`.
- Each feature is started with seams made for it. Every feature was handed one and the same object.
- New on `FeatureSeams`: `onWrite(listener)`. A feature of an app's own hears every write the routes serve, once it is committed: what vex reports of it, and the place in a chain of effects the request said it was at. It answers the way to stop hearing.
- What a caller sees: `last_import_at` is the server's clock where it was the database's. `integrations.listAttachments(hostAction)` still answers in the order of the action ids, compared character by character where it was the database's collation: on a database whose collation is not `C`, two ids that differ in a hyphen or a dot may change places. Nothing to change.

**Registering an integration is one transaction, and an approval is verified before it is written.**

- A bundle's row, its actions and the hash of its key landed as separate statements. One that failed part-way left a row that said one thing over actions that said another, or over none. They are one transaction now: a bundle lands whole, or the import before it is still there, whole.
- **`runtime.db` has to have `transaction`.** Landing a bundle and minting a frame grant are vex batches, and a batch needs a client that can transact, as any batch an app writes does. A `db` that cannot answers `500` (`Batch mutations require a transactional client.`) to a registration. `createPglitePool` has one; a pool an app wraps itself gives `transaction` as it gives `query`.
- Approving wrote the approval, handed the actions to the running manifest, and wrote the row back when that was refused. A process that died between the two writes left an approved row the next boot refused. The route now asks first whether the app could be served with what the integration shipped, and writes only then. A refused approval answers the same `422` with the same reason.
- A refused approval no longer leaves its reason in `last_error` (`lastError` in the operator's list): nothing is written. A pane that read why an approval was refused off the list reads it off the answer.
- Importing a bundle again for an approved integration asks the same question, and was answered by putting the bundle's actions into the running manifest and taking them out again when the check threw: a refusal dropped every identity record and every compiled policy twice and moved the generation pointer twice, in every process. The bundle is verified as a candidate now, and the running app is not touched. The answer is the same `422`, and an import that is accepted moves the pointer once.

**Two registrations of one new integration at once are answered one key, and it is the key that works.**

- Registering asks how the integration stands, mints a key when it holds none, and lands the bundle with the key's hash. Two registrations of one new integration in the same moment (an operator's tool that retries while the first call is still out, two operators) were both told it holds no key, both minted one, and the later landing wrote its hash over the earlier one's. Both were answered `200` with a `key`, and one of the two keys was nobody's from the start. Found by running the routes from two connections of a real Postgres: 200 rounds, 200 dead keys.
- The key's hash is written where the row holds none, in the same transaction as the bundle, and the registration reads off what was written whether its key is the one that was kept. The one whose key was kept is answered it. The other is answered as any import after the first is: `200`, its bundle landed, and no `key`.
- **A tool that registers reads `key` from the answer that carries one**, as it did, and does not expect one from every answer to a first registration it sent twice. Nothing else to change.

**No call out to an integration waits for ever, and a press image has a size.**

- New on `createIntegrations`: `outboundTimeoutMs`, default `30000` (nova's default wait for an endpoint's reply), and `pressMaxBytes`, default `5 * 1024 * 1024`.
- Every call out is given up on when it has taken `outboundTimeoutMs`, its answer and its body together: a screen's call through the proxy, a framed page and its callback, a vendor's webhook, `callIntegration`, the bundle fetched at registration, the operator's probe, and each press image. It reads as a service that is unreachable: `502` from the proxy, the frame door, the webhook and a registration whose bundle did not arrive; `callIntegration` rejects; the probe answers `status: 0`; a press image that did not arrive refuses its bundle. None had a timeout, and a service that never answered held the call for as long as the process lived.
- **An integration that takes longer than thirty seconds to answer, or whose answer streams for longer, is cut.** Set `outboundTimeoutMs` to what the slowest one needs. A longer `timeoutMs` on the integration's own action is not enough by itself: the shorter of the two ends the call.
- A press image larger than `pressMaxBytes` refuses its bundle, naming the path. It is given up on while it is read, not after. Five mebibytes is a number nobody measured; set `pressMaxBytes` if a listing ships larger images. How many images a bundle may ship is still `storePress`'s to refuse.

**A frame grant is a row, in a table of the integrations' own.**

- Frame grants lived in the memory of the process that minted them. With two processes behind one address a frame opened by one was a `404` on the other, and a restart closed every open frame. A grant is kept in a table now, by its hash and never as itself, with what it opens and when it expires. Any process redeems it. It is the same opaque string for the screen that asks for one.
- **Two migrations arrive with this release.** `integration_frame_grants` is the feature's own sequence, `nisc.moss.integrations`, and `nisc.moss` gains its third (next part). A deployment that boots with `migrations: 'verify'` runs `nisc migrate` before it starts on this release, as for any release that adds a migration. With the default, `'apply'`, the server applies both when it boots.
- **A role granted a data wildcard denies the new table too**, in an app that names the integrations feature: add `integration_frame_grants.*` beside `integrations.*` and `integration_actions.*` (AGENTS.md, rule 10a). The row holds a hash, a principal and a path.
- A frame that was open when a deployment is upgraded holds a grant the old process kept in memory. It is unknown afterwards: the screen is reloaded once.

**An integration's id is a name, and the hash of its key is its own.**

- An id is lower-case letters, digits and hyphens, and starts with a letter: what the paths (`/integrations/<id>/…`) and the action names (`ext.<audience>.<id>.<name>`) already assumed. `POST /operator/integrations` with any other id answers `400` and fetches nothing; a bundle that calls itself anything else is refused at intake.
- An integration that was registered earlier under an id that does not fit goes on being served. It cannot be imported again under that id: remove it and register it under one that fits.
- The third migration of `nisc.moss` is a unique index on `integrations.key_hash` where it is not null. No two integrations hold the hash of one key. Moss mints a key from 32 random bytes and never wrote one hash to two rows; two rows somebody gave the same hash by hand refuse the migration, and one of them is cleared first.

**A signing seed that cannot be a key refuses the boot.**

- `runtime.signingSeed` makes the keypair assertions are signed with the same in every process and across restarts. It is 32 bytes, as base64. One that decoded to fewer was dropped without a word and a random key was generated in its place: two processes given the same seed signed with different keys, each refused what the other had signed, and an integration holding the public half of one refused every call from the other. Nothing said why.
- A seed that is given and decodes to fewer than 32 bytes throws now, when the signer is made: for a server that names the integrations feature, while it boots; for `createAssertionSigner(seed)` called directly, at the call. `moss: the signing seed decodes to 13 bytes, and a signing key is 32. …` The sentence says the seed's length and never the seed.
- No seed is as it was: absent, or the empty string, generates a key that is kept nowhere. A seed longer than 32 bytes is its first 32, as it was.
- **An app whose seed is shorter than 32 bytes gives one that is 32** (`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`), or removes it. Such an app was already signing with a random key: every integration that holds its public key reads the new one from `GET /api/integrations/verify-key`, once, and it stays put from then on.

**The contract lists the fingerprints its caller may replay.**

- `GET /api/integrations/contract` listed every fingerprint the app serves under `fingerprints`, whoever asked: it compiled the caller's policy and then kept every entry. It lists the reads and writes the caller's own policy can touch now, as vex's discovery does for that policy.
- **Asked with no credential, it lists what `public` may replay.** An integration's author asks with the integration's key and `x-nisc-acts-for`, and reads what the integration's actor reaches.
- Intake is as it was: it admits an endpoint that names any fingerprint the app serves. Whether a call is served was, and is, decided by the caller's policy when it is made.

**Three answers of the integration routes differ at the edges.**

- A stored action definition that nova's schema refuses is left out of what is served, with a line in the log. It used to be served as it stood.
- A route body that is JSON and not an object (`null`) reads as an empty body. The route used to answer `500`.
- A component whose `propsSchema` cannot convert itself to JSON Schema is listed in the contract by its name and description. The contract route used to answer `500`.

**(5) A WRITE, AND TIDE**

**A lane that throws on a write no longer keeps the other from hearing of it.**

- A committed write is told to the features that hear writes (`createTideFacts`) and then to the reactions (`app.reactions`). When the fact lane threw (its `tide()`, `identity(scope)` or `chain` throwing on a scope the app did not expect) no reaction heard of that write, and the throw went to vex. Each is told on its own now: the throw is logged (`[moss:writes] …`) and the reactions run.
- A reaction that throws was already kept from the next reaction, and still is. An app has nothing to change.

**`x-tide-depth` is read as digits, not with `Number()`.**

- A write through vex may name its place in a chain of effects in two headers, `x-tide-cause` and `x-tide-depth`, which the `chain` gate of `createTideFacts` then decides whether to believe. The depth was read with `Number()`: an empty header was depth `0`, the start of a chain, and so `0x2` was 2, `1e1` was 10 and thirty nines a depth no whole number holds. A depth is digits and nothing else now, and a number that is exact. Anything else is no position: `chain` is not asked and the write is heard with none.
- A caller that writes the header as `String(depth)` has nothing to change; lyra's does.

**(6) THE SOCKET AND THE SHELLS**

**A message on the socket is read whole, by a schema, or not at all.**

- The server parses what a terminal sends. A message with a field the protocol does not name used to be routed with that field ignored; it is now answered `invalid_message` and nothing of it is acted on.
- A terminal built on `@niscorp/moss/client` sends no such message, and has nothing to change. A terminal written by hand sends exactly one of `{ type: 'event', canvas, event }`, `{ type: 'publish', channel, payload? }`, `{ type: 'popTo', canvas, instance }`, `{ type: 'back' }`, `{ type: 'resync' }`, `{ type: 'reset' }`, and nothing beside those fields.
- `invalid_message` is one sentence for every message that cannot be read. An event whose `event` is not an object used to get a sentence of its own, with its `canvas` on the reply; it gets the same answer as the rest.
- The terminal (`@niscorp/moss/client`) parses what the server sends, and the screen a drawn page carries. A message it cannot read is named by its type in the console and dropped: a tree holding something that is not one of nova's four nodes, or a node with a field nova's node does not have, used to be handed to the kit and is now not shown. An app has nothing to change.
- `readDocumentSnapshot` answers `undefined` for a snapshot that does not parse whole. It used to drop a `seed`, `path` or `live` of the wrong type and start from the rest.
- The terminal now runs zod in the page. Zod was already a peer every app installs; a page whose content security policy forbids `eval` may see zod's one probe for it reported, and sets `z.config({ jitless: true })` in its entry to skip the probe.

**The address of an upgrade is read by a schema, and a protocol is digits.**

- What a terminal writes in the address it connects to (`protocol`, `key`, `seed`, `path`, `delta`, `sealed`, `leave`) was read where each was used, each with a test of its own. One schema reads them now, where the handshake begins. What each accepts is what it accepted, with one difference.
- `protocol` was read with `Number()`: `0x2`, `2.0`, `2e0` and ` 2` were all protocol 2, and a terminal that wrote one was served. A protocol is digits and nothing else. Anything else is answered `client_too_old` and closed `4426`, as `banana` always was.
- A terminal built on `@niscorp/moss/client` writes the number, and has nothing to change.

**An event a terminal sends is read by nova's schema before a shell is handed it.**

- The socket holds `event` to being an object and no more; the shell it is dispatched into took whatever arrived. It is now parsed by nova's `NovaEventSchema` first: one of `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`, `ui:key`, `ui:drop`, with `ref`, `payload`, `origin` (and `key` on `ui:key`) and no other field. One that does not parse is dropped, as an event naming an instance that is not on its canvas is.
- A terminal built on `@niscorp/moss/client` and one of nova's adapters sends nothing else, and has nothing to change. A terminal written by hand that added a field of its own to an event, or sent a type nova does not define, used to have it dispatched; it sends nova's event.

**Shells for nobody signed in have a limit: `runtime.anonymousShellMax`, default 1,000.**

- Somebody signed in has one shell, however many terminals they open. Nobody signed in has one for each connection, and opening a connection takes no account and no token: nothing limited how many were alive, so the memory of the process was anybody's to fill.
- New: `runtime.anonymousShellMax`, how many shells for nobody may be alive at once. A connection over it is sent `{ type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' }` and closed with the new close code `4503`. No shell is built for it. Somebody signed in is served whatever the count is.
- **The default is 1,000, from a measurement.** Lyceum's real boot, 2,000 connections for nobody opened through `server.socket` and held, the heap read after a forced collection before and after: 52.5 KB of heap for each (about 110 KB resident); 26.7 KB for an app of one canvas and one action. The Node transport holds about 260 KB resident more for each connection while compression is on. A thousand fit a process given 512 MB.
- **An app with a public screen that more than a thousand visitors have open at once sets `anonymousShellMax`** to what its memory carries (`Infinity` is no limit, as before). A page of the manifest that is not live opens no socket and takes no place.
- A terminal built on `@niscorp/moss/client` has nothing to change: it logs the `error`, and reconnects with its usual backoff, as after any close that is not `4401` or `4403`. A terminal written by hand treats `4503` as a close to retry later, and keeps its token.

**A failure on the socket stays one terminal's, and its text stays on the server.**

- A message the server reads and then throws on used to let the throw out into the transport's listener, where Node ends the process and every session with it. It is now logged, and the terminal is sent an `error` with the code `message_failed`; the connection stays open.
- A session the server could not open used to send the terminal the error's own text, which can name a host, a table or a database user. The `session_failed` error now says only that the session was refused, and the error is in the server's log. It still names the definitions that failed validation, when that is the cause.
- A handshake that failed (the verifier threw, what somebody holds could not be asked, their shell could not be built) emitted no span: with the verifier down, upgrades did not turn into errors on whatever reads `runtime.telemetry`, they stopped being counted. It emits one `socket.upgrade` span now, `status: 'error'`, with `hasPrincipal` as far as the handshake got. A sink that counts `socket.upgrade` spans by status gains a value.
- An app has nothing to change.

**A living shell holds what its principal holds now, and nothing that left.**

- When what the app consists of changes (`replaceActions`, `refresh`, an integration approved or removed, a change another process made), every living shell adopts. It used to register what was held and never take anything away: an action that was removed, or that its principal was no longer granted, stayed mounted and pushable in every shell that had it, until that shell was rebuilt. It is now removed from the shell: its instances are unmounted, it leaves the history `back` walks, and a push of it fails as for any action the principal does not hold.
- **Every living shell is every one the server built that has not ended**: the shell the app keeps for each signed-in person, the shell built for each connection of nobody signed in, and the shell a page builds for each connection, signed in or not. The last two used to keep what they were built with for as long as they lived, so a page somebody had open, and a visitor's screen, went on offering an action that had left. `server.shells.adopt()` and `server.page(path).host.adopt()` each reach every living shell of that host; a change reaches every host. A shell built to draw one document (`snapshot`) is read and ended, and adopts nothing.
- **A host holds a shell that is not kept until it ends**, which is how a change reaches it. It ends when its last terminal leaves, and the host holds nothing of it from then on. The socket does that for every connection it opens. Code that opens such a session in process and attaches nothing (`server.shells.session(null, null)`, `server.page(path).host.session(…)` in a check or a tool) ends it with `session.detach(connection)`, as the socket does for a connection that closed early; left alone, it used to be collected once nothing referenced it, and is now held for as long as the server is. A check that runs and exits has nothing to change.
- **`server.invalidateIdentity(principal)` resets every living shell of that principal**: the one the app keeps for them, and the shell a page built for each connection of theirs. It reset the kept one alone, so a page they had open went on as who they had been. `reset(principal)` on a page's host answered `false` and did nothing; it rebuilds each of their shells on that host, carrying its terminal across, and answers `true`.
- A shell whose principal could not be resolved during an adopt used to end the walk, and every shell after it kept the old application. It is logged and keeps what it held; the rest adopt.
- A shell that was being built while the app changed adopts when its build lands, and so does one a reset was replacing: the replacement is built from what its principal held when the reset began, and used to take the shell's place holding that. Two changes are adopted in the order they happened.
- An action a living shell gains may mention a component no layout mentioned before: it is registered when the shell adopts. The component names a shell is built with are read off the actions in force each time they change, and were read once, when the server started.
- An app has nothing to change. One that relied on a revoked screen staying open until the next sign-in no longer sees it.

**One shell for a principal, one reset of it at a time, and the canvases it has are its own.**

- Two first arrivals for one principal in the same moment (a drawn page's read and its socket, two tabs) each built a shell. The second took the first's place and the first was never disposed: its `functions` and `onSession` code ran for as long as the process did. One is built, and both are handed it. `functions` and `onSession` are called once for it.
- Resets that overlapped (`server.invalidateIdentity` twice, or with a terminal's own `reset`) could leave every terminal attached to a shell that was no longer the principal's: nothing they pressed arrived. A shell's resets run in turn.
- A page's shell that was reset lost the parameters of its path and the instance ids its page was drawn with. It is rebuilt with what it was opened with.
- A canvas a shell gained while it ran (`shell.addCanvas`, or a push to a canvas its manifest does not list) was never sent to a terminal: the host walked the manifest's list. It is rendered, sent, attached to and read by a snapshot like the ones the shell was built with. A canvas that was removed is sent empty once, and no longer handed to a terminal that attaches later.
- An app has nothing to change.

**A shell is attached to what it uses of a connection.**

- `server.shells.session(…)` answers a session whose `attach`, `detach` and `resync` took the transport's `Connection`. They take what a shell uses of one: `{ send, close, seal? }`. A `Connection` is one of those, so a transport and a check that pass a connection have nothing to change. An object literal written in place with `onMessage` or `onClose` beside them is refused by the compiler, as any literal with a member its type does not have: the shell never called either, and they are dropped (encore's check is changed here).

**A connection that closed before its session was ready leaves nothing attached, and a live connection's credential is asked about by one pass at a time.**

- Opening a session waits twice: for what somebody holds, then for their shell to be built. A terminal that left in between (a tab closed while its shell was built, a reconnect that gave up) was attached to the shell all the same, and on Node nothing detached it afterwards: `ws` tells a close to whoever is listening when it happens, and the socket started listening after the second wait. A signed-in person's shell then counted a terminal that was not there and was never swept as idle (`runtime.shellIdleMs`); a shell built for nobody was never disposed. The close is heard before either wait now. A connection that closed while its catalog was asked is not handed to a shell host; one that closed while its shell was built is not attached, and the shell idles, or is disposed, at once.
- A transport's `onClose` is called once for a connection, where it was called up to three times.
- Every `sessionRevalidateMs` the socket asks `session` about each signed-in connection, one after another. The timer started the next pass whether or not that one had finished, so a verifier that took longer than the interval was asked by two passes at once, then three. A pass that is due while one is still asking is skipped now.
- A verifier that throws leaves the connection open, as before. That it threw was dropped without a word; it is logged, once for a pass, with how many connections could not be asked about and the first error.
- A connection whose transport throws when it is told its session expired stayed in the list, so every later pass threw at the same place: no connection after it was asked about again, and the throw was an unhandled rejection. It is forgotten first, closed even if it cannot be told, and what it threw is logged.
- An app and a transport have nothing to change.

**(7) PAGES, AND THE NODE ENTRY**

**A document's `root` is any empty element, and one with no place for a screen is not reported as drawn.**

- `renderDocument` put the screen into the root by looking for `></div>` in it. A `root` that was another element (`<main id="app"></main>`) was written back as it was, with the snapshot beside it and no screen in it, and the page was reported `drawn: true`: the terminal started from a screen that was not in the page. The screen goes inside any root that is an empty element now, an opening tag and at once its closing tag.
- A `root` with no inside (an opening tag alone, an element that holds something, one closed in its own tag) is answered as a template that does not hold the root always was: the template as it is, `drawn: false`, and one line in the log that names the root.
- An app that passes no `root`, or one that is an empty `div`, sees no difference.

**`DocumentConfig.server` is the three things a document asks, and `createPageRouter` takes what it reads of a page.**

- `renderDocument` and `exportDocuments` took a `MossServer` and called `principalOf`, `page` and `shells` on it. `server` is typed as those three now, and of each shell host as `snapshot` alone. A `MossServer` is one of them: a caller that passes its server has nothing to change, and a check that stood a server up to draw a page can hand over the three.
- `createPageRouter(pages)` took `Record<string, PageManifest>` and read `path`, `params` and each canvas's `id`. It takes a record of those. A record of `PageManifest` is one.

**`serve` stops what it started.**

- `serve(app, runtime)` (`@niscorp/moss/node`) makes an HTTP listener and a websocket transport and returns the server and neither of them. `server.close()` stopped moss's timers and left the port bound and every terminal connected, and nothing else could reach either. `close()` on the server `serve` returns now stops all three: moss's own timers, then every connection (closed `1001`), then the listener.
- `attachSocket(…)` answers `{ close }` where it answered nothing: `close()` ends every connection the transport opened (`1001`) and takes no more. A host that ignores what it answers has nothing to change.
- An app that called `server.close()` on a server from `serve` and went on using the port has to stop doing one of the two. `createServer`'s own `close` is as it was.

**The two settings of the transport hold wherever a server's socket is attached: `runtime.socketMaxMessageBytes`, `runtime.socketCompression`.**

- New: `runtime.socketMaxMessageBytes`, the largest message a connection may send. It could be said to `attachSocket` (`maxMessageBytes`) and not to the runtime. Unset, the limit is the transport's 256 KiB, as before.
- `runtime.socketCompression` was read by `serve` and by nothing else: `nisc start` and the dev plugin attach the socket themselves and are not handed the runtime, so under those two a deployment that turned compression off was served compressed. The server reads both settings now, once, and the socket it hands out (`server.socket`) carries them to whichever transport is handed it. They hold under `serve`, `nisc start`, the dev plugin, and a host that calls `attachSocket(httpServer, server.socket)`.
- **A deployment that set `socketCompression` and runs under `nisc start` or `nisc dev` gets what it set**, where it got compression on. Nothing to change, unless the setting was left there by mistake.
- `attachSocket`'s `options` are for a host that means otherwise, and for an accept of its own that says nothing: a setting named there wins, and one that is not named stays what the socket says. A host that passed `{ compression: runtime.socketCompression }` itself deletes the argument.
- **In the dev plugin, the connections of an app that an edit replaced are closed (`1001`).** The plugin kept one transport for as long as vite ran, and a terminal that was connected when an edit re-booted the app stayed attached to the server that had been let go. There is one transport for each app that is booted now, set as that app's runtime says and retired with it: a page is reloaded as before, and a terminal that is not a page (a console) connects again, to the app that is booted. An upgrade that meets an app that did not boot is answered `503`, where it was opened and closed with `1011`.

**The dev sign-in answers this machine only.**

- `/dev/as/<who>` (the dev plugin's `signIn`, `dev.signIn` in `nisc.config.ts`) puts a session for whoever the address names in the browser that asks. It asked nothing about where the request came from: with vite listening on a network (`vite --host`), every device on that network could sign in as anybody.
- It answers a request whose socket ends on this machine: `127.0.0.0/8`, `::1`, or either written as an IPv4-mapped IPv6 address. Any other is answered `403` with a sentence that says why, and the app's `signIn` is not called. What a header says of where a request came from (`X-Forwarded-For`) is not read.
- New on `mossDev`: `signInFromNetwork: true` answers it to every device that can reach the dev server, for trying a signed-in screen on a phone on a network you trust. The name says what it opens: the sign-in, to the network.
- **A developer who opened `/dev/as/<who>` from a second device** sets `signInFromNetwork: true` where the app adds `mossDev` itself. `nisc dev` adds the plugin for the app and does not turn it on: under `nisc dev` the sign-in is this machine's.
- A dev server behind a proxy on the same machine sees every request as the proxy's, which is this machine: the check cannot tell those apart, and a proxy that listens on a network is its owner's to close.
- **It is not answered to a page of another site either.** Such a page is open in the developer's own browser, so its request comes from this machine. Run in Chrome before this change: a page of another site that sent the browser to `/dev/as/<who>` left it signed in as whoever the page had named, and an image, a fetch or a frame of the address had the app mint a session each time (the browser kept no cookie from those three). A browser says which site started a request, in a header a page cannot write: a request marked `Sec-Fetch-Site: cross-site` is answered `403` with why, and `signIn` is not called, whatever `signInFromNetwork` says.
- An address that is typed, pasted, bookmarked, opened by a tool, or linked from the app's own page is answered as before. **A link to `/dev/as/<who>` on another site's page** (a README in a browser, a chat) is refused when it is clicked: paste the address instead.

**(8) THE TERMINAL**

**Every render target is told the connection's status, the same way.**

- After a connection dropped, the last screen stayed up and nothing on it said so. The wire has always known (`wire.status()`), and told whoever subscribed; but what a target renders against had no status on it, so the React, Vue and DOM targets were never told, and the tty and ink targets were told only where the host remembered to pass `status: wire.status`.
- `TerminalApi`, what a target renders against, gains `status(): WireStatus` beside `frame()` and `canvasTree()`. The conductor (`createTerminal`, `mountTerminal`) fills it from its wire, and a change of status is an `update` like a change of a tree, as it already was.
- **`ttyTarget` and `inkTarget` take no `status`.** They read it from what they render against. An app deletes the line: `ttyTarget({ input, output, status: wire.status })` → `ttyTarget({ input, output })`, and the same for `inkTarget`. What they print is what they printed. (relay's `tty.ts`, `ink.ts` and ink check, and lyceum's ssh door, are changed here.)
- **The React, Vue and DOM targets say the status on their root element**, as `data-wire-status="connecting | open | closed | incompatible | static"`, from the moment they mount until they are destroyed, and draw nothing for it. What a lost connection looks like is the app's: its stylesheet (`[data-wire-status='closed'] …`), or a component of its kit that reads the status where the target provides what it renders against, `useContext(TerminalApiContext)?.status()` in React and `inject(TerminalApiKey)?.status()` in Vue, and is drawn again when it changes.
- A page drawn on the server (`renderSnapshot` of each target) is drawn with the status its terminal starts in, so a kit component that draws the status draws the same thing on both sides and the page is adopted: `static` for a snapshot that says `live: false` (no socket is opened for it), `connecting` for every other.
- **A target of an app's own** is handed the status and may read it; one that hands what it renders against on to a moss target has nothing to change (lyceum's does). **Code that builds a `TerminalApi` by hand** to drive a target directly (a test) adds `status: () => 'open'`.

**The wire holds one socket at a time.**

- `wire.reset()` on a socket that is not open connects again. Pressed while a connect was still in flight (the reset key held down on a slow network, a reset straight after the page loads), the socket it was waiting on was left as it was, with the wire still listening to it. Both opened: two sockets wrote one snapshot, a sign-out or a drop heard on either was taken for the connection's, and the first to close scheduled a third. The wire lets go of the socket it had before it makes another: it is no longer listened to, and it is closed.
- A wire whose status is `incompatible` stops retrying, and `reset()` is the way to try again once the server has been updated. A connection made that way kept the mark of the one before it: when it later dropped for any reason, the status read `incompatible` again and nothing retried. Whether the two ends can speak is found out for each connection now.
- An app has nothing to change.

**In the full-screen terminal, digits that arrive together are the number they spell, and `onQuit` is the terminal ending.**

- `inkTarget` acts on a typed number: `12` clicks what is marked `[12]`. It read one digit for each key it was handed, and two keys pressed in turn can be handed over as one (a slow link, an ssh session, a paste): those were dropped, and nothing happened. They are read as the number they spell.
- `onQuit` was called whenever the ink app unmounted, so a host that destroyed the terminal itself (`terminal.destroy()`, a swap to another target) was told that somebody quit. A handler that ends the process ended it on a swap. `onQuit` is not called for a destroy now, as `ttyTarget`'s never was. A host that relied on `onQuit` to clean up after its own `destroy()` does that cleanup where it calls `destroy()`. relay and lyceum did not rely on it.
- A component of the kit that throws while ink draws it ends the ink app, and ink says so by rejecting. Nothing handled that: the rejection reached the process, and Node ends a process on a rejection nobody handles, with every other terminal in it (a host that serves terminals over ssh has one for each person). It is logged (`[moss/ink] the terminal ended on an error:`) and reported through `onQuit` now, like a quit: that terminal ends, and the process and the others go on.

**WHAT AN APP CHANGES**

In this order. An app that uses no integrations and no tide skips steps 3 and 4, and one whose terminal is built on `@niscorp/moss/client` and moss's targets skips step 10.

1. **Move the packages together.** `@niscorp/moss`, `@niscorp/nisc`, `@niscorp/cli` and `create-nisc` are one breaking release; `@niscorp/tide` moves with them for an app that runs tide, because the store and the driver are in it now.
2. **Let the compiler list the imports.** Every name that left `@niscorp/moss` is in the table at the top, with what to write instead.
3. **Integrations.** Create the feature (`createIntegrations({...})`), move the eight fields off the manifest into it, name it in `features`, and call `listAttachments`, `listPlacements`, `integrationByKey` and `callIntegration` on it. Check that `runtime.db` has `transaction`. Add `integration_frame_grants.*` to the denies of every role that holds a data wildcard. Set `outboundTimeoutMs` if an integration answers in more than thirty seconds, and `pressMaxBytes` if a listing image is over five mebibytes. Give `runtime.signingSeed` 32 bytes as base64, or none: a shorter one refuses the boot.
4. **Tide.** Import the store from `@niscorp/tide/postgres` and the driver from `@niscorp/tide`. Replace `facts: { tide, identity, chain }` with `createTideFacts({ tide, identity, chain })` in `features`.
5. **The manifest.** Remove any field `NiscApp` does not have. Where code edited the manifest after `createServer` (most often `app.actions`, then `refresh()`), hand the actions over with `server.replaceActions(name, actions)`, and read the actions in force from `server.actions()`. Where the app runs several processes, keep that set in rows and name how it is read in a feature of the app's own (`seams.loadActionsFrom(name, load)`): a set handed to one process is not handed to the others.
6. **Functions.** Replace `session.runtime` with the runtime the app created, `session.policy` with `server.policyForRoles(session.roles)`, and an engine built from the two with `session.answerIntent(writers, asked)`.
7. **Who is calling.** Replace `session: devSession` with `session: 'dev-open'`. Have `identity.resolve` answer `{ roles: ['public'], scope: {} }` for a principal it does not know, where it threw. Where code matched `401` `no_identity`, match `500` `identity_failed`. Give `runtime.identityMax` 1 or more, or leave it unset. Where a deployment has a `runtime.fabric`, have its transport hand `apply` the object that was published, parsed, with nothing added to it.
8. **Checks.** Replace `resolveCatalog`, `resolveCatalogForRoles` and `resolvePolicyForRoles` with `server.catalogOf`, `server.catalogForRoles` and `server.policyForRoles`; replace a boot check put together by hand with `server.charterReport()` or `verifyApp(app, grants)`.
9. **The terminal.** Delete `status: wire.status` from `ttyTarget` and `inkTarget`. Add `status: () => 'open'` where a test builds a `TerminalApi` by hand. Style `[data-wire-status='closed']` if a lost connection should show.
10. **A terminal written by hand.** Send the six messages with exactly their fields, and nova's events with exactly theirs; treat a `4503` close as one to retry later.
11. **Before the first start.** A deployment that boots with `migrations: 'verify'` runs `nisc migrate`: `nisc.moss` has a third migration and `nisc.moss.integrations` is new. A page that more than a thousand visitors have open at once, none signed in, sets `runtime.anonymousShellMax`. A host that calls `server.close()` on what `serve` answered expects the port to be let go. A host that passed `runtime.socketCompression` to `attachSocket` itself deletes the argument: the server's socket carries it.
12. **In development.** `/dev/as/<who>` answers this machine only, and not a link clicked on another site's page: paste the address, or set `signInFromNetwork: true` on `mossDev` to open it to other devices. A terminal that is not a page is closed (`1001`) when an edit re-boots the app, and connects again.
