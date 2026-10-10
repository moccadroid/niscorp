---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss is rebuilt as modules, and its public API is what an app is meant to call. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-09: import only what `@niscorp/moss` still exports (the list is `packages/moss/api.txt`); the changes an app has to make are listed below, one per part.

Moss had grown to twenty-eight files flat in `src/`, one of them a single function of 1,345 lines, and it exported 135 names of which 71 were imported by nothing outside the package. `docs/plans/moss-refactor.md` is the audit and the plan.

**The main entry exports 50 names, not 135.**

- Gone, and never part of what an app calls: `createShellHost`, `createSocket`, `createDataLayer`, `createGeneration`, `createIdentityCache`, `wireFabric`, `runIntake`, `copyPress`, `callIntegrationWith`, `initIntegrations`, `listIntegrations`, `loadIntegrationActions`, `filterInstalled`, `buildContract`, `contractAsMarkdown`, `describePlacements`, `verifyAssertion`, `mintIntegrationKey`, `hashIntegrationKey`, `mintWrites`, `revokeSession`, `sessionVerifierOf`, `shellNeedOf`, `emitterOf`, `spanClock`, `resolvePolicyAtReach`, `resolveVariantsForRoles`, the constants `GENERATION_DDL`, `SESSIONS_SEQUENCE`, `SNAPSHOT_ELEMENT_ID`, `CLOSE_SHELL_FAILED`, `DEFAULT_GENERATION_POLL_MS`, `DEFAULT_IDENTITY_IDLE_MS`, `DEFAULT_IDENTITY_MAX`, `DEFAULT_IDLE_MS`, `DEFAULT_REVALIDATE_MS`, and the types that went with them.
- An app that imported one of these was reaching into moss. Say which and why in an issue; the answer is a call that is meant to be public, not the name coming back.
- Seven more names moved to `@niscorp/moss/integrations`, and two types arrived, `Feature` and `FeatureSeams`: see "Integrations are a feature" below.
- Six more left for tide, where they are called by the names they had: see "Tide's hosting is tide's" below.

**A message on the socket is read whole, by a schema, or not at all.**

- The server parses what a terminal sends. A message with a field the protocol does not name used to be routed with that field ignored; it is now answered `invalid_message` and nothing of it is acted on.
- A terminal built on `@niscorp/moss/client` sends no such message, and has nothing to change. A terminal written by hand sends exactly one of `{ type: 'event', canvas, event }`, `{ type: 'publish', channel, payload? }`, `{ type: 'popTo', canvas, instance }`, `{ type: 'back' }`, `{ type: 'resync' }`, `{ type: 'reset' }`, and nothing beside those fields. What is inside `event` is not narrowed by the socket: the shell it is dispatched into reads it by nova's schema (see "An event a terminal sends", below).
- `invalid_message` is one sentence for every message that cannot be read. An event whose `event` is not an object used to get a sentence of its own, with its `canvas` on the reply; it gets the same answer as the rest.
- The terminal (`@niscorp/moss/client`) parses what the server sends, and the screen a drawn page carries. A message it cannot read is named by its type in the console and dropped: a tree holding something that is not one of nova's four nodes, or a node with a field nova's node does not have, used to be handed to the kit and is now not shown. An app has nothing to change.
- `readDocumentSnapshot` answers `undefined` for a snapshot that does not parse whole. It used to drop a `seed`, `path` or `live` of the wrong type and start from the rest.
- The terminal now runs zod in the page. Zod was already a peer every app installs; a page whose content security policy forbids `eval` may see zod's one probe for it reported, and sets `z.config({ jitless: true })` in its entry to skip the probe.

**A failure on the socket stays one terminal's, and its text stays on the server.**

- A message the server reads and then throws on used to let the throw out into the transport's listener, where Node ends the process and every session with it. It is now logged, and the terminal is sent an `error` with the code `message_failed`; the connection stays open. An app has nothing to change.
- A session the server could not open used to send the terminal the error's own text, which can name a host, a table or a database user. The `session_failed` error now says only that the session was refused, and the error is in the server's log. It still names the definitions that failed validation, when that is the cause. An app has nothing to change.

**The record `identity.resolve` answers is read by a schema.**

- `roles` is a list of strings, `scope` an object, `installed` (when there) a list of strings, `tag` (when there) a string. A record that does not fit is refused with a sentence that names the field, and nothing is held for that principal: a request whose principal resolves to such a record is answered `500` `identity_failed`, as any failure to find out who is calling is (see "A failure to find out who is calling", below). It used to be carried on as it was, and failed later, somewhere else, or not at all.
- What is inside `scope` is not looked at, and a field moss does not name stays on the record the `scope` hook is handed.
- An app whose `resolve` returns an `IdentityRecord` has nothing to change.

**The dev verifier is not exported, and a verifier of the app's own is named at boot.**

- `devSession` is gone from the main entry. It trusts any token that carries a `sub`, and passed as `session: devSession` it booted without the line `session: 'dev-open'` prints. An app that imported it sets `session: 'dev-open'`, which is the same verifier and says so at boot. A check that wrapped it to make a token expire keeps a map of the tokens it issued instead. `mintDevToken` stays.
- A `session` that is a function prints one line at boot: `[moss] session: a function the app supplied (name) decides who a token is.` Nothing about the verifier changes, and an app has nothing to do.

**An identity that is forgotten stays forgotten.**

- `invalidateIdentity`, `invalidateTenant` and `refresh` forget what moss holds of a principal. A record that was being resolved while one of them ran used to be held when it landed, so a role change or an install made at that moment was not seen until the record expired by itself (`sessionRevalidateMs`). It is now handed to whoever was waiting for it and not held. An app has nothing to change.

**`runtime.identityMax` of zero or less refuses the boot.**

- With an `identity` seam declared, `identityMax: 0` (or less) used to boot and then hang the process on the first sign-in: making room in a cache that has none never ended. `createServer` now refuses it with a sentence that names the setting. Give it 1 or more, or leave it unset for the default of 10,000.

**`refresh` runs the check boot runs.**

- `refresh()` ran a shorter copy of the boot check: the charter and the layout variants. It is now the same verification as boot's, entries' `reach` included. It verifies what is in force, and what is in force was verified when it was taken, so an app sees no difference.
- The entries the server knows are the ones it booted with. One added to `app.entries` afterwards was never seeded; adding one now throws (the manifest is frozen, below).
- A boot that is refused prints the chains of steps that never end before it throws. It printed them only when the charter had passed.

**The manifest is parsed and frozen when it is handed over.**

- `createServer(app, runtime)` parses the manifest before anything else uses it, and a manifest that does not parse refuses the boot with `The manifest does not parse — refusing to serve:` and one line for each place that does not fit (`actions.home: Unrecognized key: "tittle"`, `shell.inputs: expected a function`). It used to be used as it stood: a definition nova refuses was found when a shell that holds it was built, for whoever connected first, and a seam that was not a function when it was first called.
- An action, a fragment and a layout are read by nova's schemas, an entry's `dsl` and `mutation` by vex's, its `mapping` by Prism's, `grammars` by strata's. Every other data field is held to the shape `NiscApp` gives it, and a code seam to being a function.
- A field the type does not have is refused, on the manifest itself, on the shell or a page, on a canvas, a layout variant, an entry, a reaction, `identity` and `phraseKeys`. The compiler already refuses one written in place; one that arrived through a spread or a cast used to be carried and ignored. An app that kept something of its own there keeps it beside the manifest. A component's contract (`shell.components`) and a resource written as an object may still carry more than moss names.
- An app whose manifest is typed as `NiscApp`, with no cast and no extra field on the way, has nothing to change for the parse.
- Then `createServer` freezes the manifest, every level of it, in place. Once it has returned, an edit throws a `TypeError` where it is written: `app.actions.x = …`, `delete app.actions.x`, `app.actions = …`, `app.charter.role = …`, `app.entries.push(…)`, a write to a definition, a layout node, a canvas or a variant. A function and an instance of a class (a zod schema a kit handed over as a component's props) are not frozen and not looked inside. Before `createServer` is called nothing is frozen: `defineApp` returns its argument, and an app may go on assembling it.
- An edit to the charter, the behaviors or the layout variants used to be half served: it reached whoever was resolved next and nobody already resolved, and no check had seen it until a `refresh`.
- **What an app does instead.** Actions that arrive while it runs are handed over as a set: `server.replaceActions(source, actions)`, which verifies before it switches (below). A set that was taken is frozen the same way, so it is changed by handing over another of the same name. A charter, a layout variant, an entry, a behavior and the shell do not change while a server runs: they change in the manifest the next server is created with.
- An object the app shares between its manifest and its own code is frozen for both: code that wrote to one writes to a copy of its own. The checks of the five lab apps (lyceum, lyra, atrium, relay, encore) ran against the frozen manifest and none of them hit one, in the app, in moss or in nova.

**`server.replaceActions(source, actions)`: an app hands over the actions it loads from rows.**

- New. An app that loads actions from its own tables hands them over: `server.replaceActions('bundles', actions)`. The name is the app's; handing the same name over again puts the new set in place of the old, so an action it no longer names leaves. The actions in force are what the app shipped, then each set. `'integrations'` is the name of moss's own set, read from its integration tables.
- What the app would then consist of is verified first. Refused, the call throws with the sentence `refresh` throws and nothing changed: not the actions being served, not what any role holds, not the record that was handed in. Accepted, it does what `refresh` does: memos are dropped, living shells adopt, and every other process follows within one poll; and the set is frozen.
- Editing `app.actions` and calling `refresh()` is gone. The edit throws, and `refresh` ships nothing: it verifies what is in force again, drops what was derived from it and has living shells adopt, which is what a changed role or install needs.
- `app.actions` is what the app shipped, and stays it. Moss wrote the integrations' actions into that record; it no longer does. Code that read them there reads `server.actions()`.

**A server answers what somebody holds, which actions are in force, and whether a set would be taken.**

- New on `MossServer`: `catalogOf(principal)` and `catalogForRoles(roles, installed?)` answer `{ ids, hash }` from the actions in force; `actions()` is the actions in force, by id; `verifyActions(source, actions)` is the dry run of `replaceActions`, answered as a report, changing nothing.
- New in the main entry: `verifyApp(app, grants)`, the check boot runs for an app that is not booted, and the type of its report, `ManifestReport`.

**Five internals leave the main entry, each for the call that answers what it was used for.**

- `resolveCatalog(app, principal)` → `(await server.catalogOf(principal)).ids`. The old one read `assignments` and nothing else, so in an app that resolves people through `identity` it answered as `public` for everybody the assignments did not name; the server resolves who somebody is the way a request does, and answers from the actions in force.
- `resolveCatalogForRoles(app, roles, installed)` → `server.catalogForRoles(roles, installed)`.
- `auditClosure`, `wearableOf`, `verifyVariants`: the three pieces an app put together to run the boot check by hand → `server.charterReport()` for what a running server is serving, `server.verifyActions(source, actions)` for a set it has not taken, and `verifyApp(app, grants)` where there is no server (`report.charter` is what `verifyCharter` answered, closure issues included; `report.errors.filter((error) => error.check === 'variants')` is what `verifyVariants` returned).
- Code running in a session that wants what its own caller holds asks `GET /catalog` over the session's wire, as before.

**`resolvePolicyForRoles` leaves the main entry, for `server.policyForRoles(roles)`.**

- `resolvePolicyForRoles(app, grants, roles)` → `server.policyForRoles(roles)`: the vex policy a request by somebody holding exactly those roles is served under. The old one compiled from whatever manifest and whatever list of grants it was handed, so a check that wrote the grants down itself read a policy no request was served under. The server compiles from the charter and the `behaviors` in force, over every table the database has.
- New on `MossServer`: `policyForRoles(roles): ScopePolicy`. One policy per role, merged, as before. The answer is compiled for the asking and is the caller's own: nothing done to it reaches a request.
- Where there is no server, `resolvePolicy(app, grants, principal)` is still exported. It reads `assignments`, so in an app that resolves people through `identity` it answers as `public` for everybody the assignments do not name.

**A bundle the app would not serve is refused without being tried on the running app.**

- Importing a bundle again for an approved integration (`POST /operator/integrations`) asks whether the app could be served with it. That was answered by putting the bundle's actions into the running manifest and taking them out again when the check threw, so a refusal dropped every identity record and every compiled policy twice and moved the generation pointer twice, in every process. The bundle is now verified as a candidate, and the running app is not touched. The answer is the same `422` with the same reason.
- An import that is accepted moves the pointer once, not twice. An app has nothing to change.

**Integrations are a feature: `@niscorp/moss/integrations`, named in `features`.**

- Integrations (services that add screens: registration and approval, the proxy, frames, webhooks, the integration key) are not part of moss's core any more. They ship from an entry point of their own, and an app that uses them creates the feature and names it in its manifest:

  ```ts
  import { createIntegrations } from '@niscorp/moss/integrations';

  const integrations = createIntegrations({ integrationActor, attachable, menuSlots, placementNames, storePress });
  const app = defineApp({ charter, actions, features: [integrations] });
  ```

- **Nine fields leave `NiscApp`.** Eight are the configuration of `createIntegrations`, under the names they had: `integrationActor`, `attachable`, `menuSlots`, `assistantTools`, `publishChecks`, `editorRegions`, `placementNames`, `storePress`. The ninth, `installedIntegrations`, was deprecated and never called, and is gone. A manifest that still names one of the nine is refused at boot, as any field the type does not have is: `(the manifest): Unrecognized key: "menuSlots"`.
- `NiscApp.features?: readonly Feature[]` is new. The server starts each feature, in order, once its core stands and before anything is served.
- **An app that does not name the feature has no integrations.** None of `/api/integrations/*`, `/integrations/:id/*` and `/operator/integrations` is served, an `ik_` key is read as a session token and refused as one (`invalid_token`), and no integration's actions are loaded. The tables are still created; rows in them are not served.
- **Each call that moved is on the object `createIntegrations` returned**, and takes no pool: it uses the one the server was given.
  - `server.callIntegration(id, path, init)` → `integrations.callIntegration(id, path, init)`. `MossServer.callIntegration` is gone.
  - `listAttachments(pool, hostAction)` → `integrations.listAttachments(hostAction)`.
  - `listPlacements(pool)` → `integrations.listPlacements()`.
  - `integrationByKey(pool, key)` → `integrations.integrationByKey(key)`.
  - `integrationOfAction(id)` → the same function, imported from `@niscorp/moss/integrations`; also `integrations.integrationOfAction(id)`.

  They work once `createServer` has answered. Before that the four that read rows reject with a sentence that says so.
- **The import path that changed:** `createAssertionSigner`, `integrationOfAction` and the types `StorePress` and `CallIntegration` come from `@niscorp/moss/integrations`, not `@niscorp/moss`. New there: `createIntegrations` and the types `Integrations` and `IntegrationsConfig`.
- An app that read one of the eight fields back off its own manifest (`app.attachable`) keeps the value where it creates the feature.
- What a caller of the routes sees is what it saw, with these differences at the edges:
  - A stored action definition that nova's schema refuses is left out of what is served, with a line in the log. It used to be served as it stood.
  - A route body that is JSON and not an object (`null`) reads as an empty body. The route used to answer 500.
  - A component whose `propsSchema` cannot convert itself to JSON Schema is listed in the contract by its name and description. The contract route used to answer 500.

**Integrations read and write through vex, and a feature is handed no pool.**

- Every statement integrations ran on `integrations` and `integration_actions` is a vex entry now, replayed in process. Moss held twenty statements with no reason outside vex; none is left (the generation counter went last, below), and `pnpm check:raw-sql` holds the count at zero.
- The entries are the feature's own. They are seeded into a cache no route serves, so `/api/vex` answers `cache_miss` for one of them whatever the charter grants whoever asks, and they run under a policy that admits the feature's tables and nothing else. A data grant on `integrations` opens no approval and no registration: those stay behind the operator key.
- `FeatureSeams` has no `pool`. A feature of an app's own hands its reads and writes over as entries, with the tables they touch, and replays them: `const replay = await seams.ownEntries({ entries, tables })`, then `await replay(fingerprint, context)`.
- `Feature.tables?: readonly Sequence[]` is new: the strata sequences of the tables a feature keeps. The server migrates them in the one ledgered run, after moss's own and before `runtime.tables`, and `migrateTables` (`nisc migrate`) runs them too.
- What a caller sees: `last_import_at` is the server's clock where it was the database's. `integrations.listAttachments(hostAction)` still answers in the order of the action ids, compared character by character where it was the database's collation: on a database whose collation is not `C`, two ids that differ in a hyphen or a dot may change places. Nothing to change.

**Registering an integration is one transaction, and an approval is verified before it is written.**

- A bundle's row, its actions and the hash of its key landed as separate statements. One that failed part-way left a row that said one thing over actions that said another, or over none. They are one transaction now: a bundle lands whole, or the import before it is still there, whole.
- **`runtime.db` has to have `transaction`.** Landing a bundle and minting a frame grant are vex batches, and a batch needs a client that can transact, as any batch an app writes does. A `db` that cannot answers `500` (`Batch mutations require a transactional client.`) to a registration. `createPglitePool` has one; a pool an app wraps itself gives `transaction` as it gives `query`.
- Approving wrote the approval, handed the actions to the running manifest, and wrote the row back when that was refused. A process that died between the two writes left an approved row the next boot refused. The route now asks first whether the app could be served with what the integration shipped, and writes only then. A refused approval answers the same `422` with the same reason.
- A refused approval no longer leaves its reason in `last_error` (`lastError` in the operator's list): nothing is written. A pane that read why an approval was refused off the list reads it off the answer.

**No call out to an integration waits for ever, and a press image has a size.**

- New on `createIntegrations`: `outboundTimeoutMs`, default `30000` (nova's default wait for an endpoint's reply), and `pressMaxBytes`, default `5 * 1024 * 1024`.
- Every call out is given up on when it has taken `outboundTimeoutMs`, its answer and its body together: a screen's call through the proxy, a framed page and its callback, a vendor's webhook, `callIntegration`, the bundle fetched at registration, the operator's probe, and each press image. It reads as a service that is unreachable: `502` from the proxy, the frame door, the webhook and a registration whose bundle did not arrive; `callIntegration` rejects; the probe answers `status: 0`; a press image that did not arrive refuses its bundle. None had a timeout, and a service that never answered held the call for as long as the process lived.
- **An integration that takes longer than thirty seconds to answer, or whose answer streams for longer, is cut.** Set `outboundTimeoutMs` to what the slowest one needs. A longer `timeoutMs` on the integration's own action is not enough by itself: the shorter of the two ends the call.
- A press image larger than `pressMaxBytes` refuses its bundle, naming the path. It is given up on while it is read, not after. Five mebibytes is a number nobody measured; set `pressMaxBytes` if a listing ships larger images. How many images a bundle may ship is still `storePress`'s to refuse.

**A frame grant is a row, in a table of the integrations' own.**

- Frame grants lived in the memory of the process that minted them. With two processes behind one address a frame opened by one was a `404` on the other, and a restart closed every open frame. A grant is kept in a table now, by its hash and never as itself, with what it opens and when it expires. Any process redeems it. It is the same opaque string for the screen that asks for one.
- **A new table, and a new migration.** `integration_frame_grants` is the feature's own sequence, `nisc.moss.integrations`, and `nisc.moss` gains a third migration (below). A deployment that boots with `migrations: 'verify'` runs `nisc migrate` before it starts on this release, as for any release that adds a migration. With the default, `'apply'`, the server applies both when it boots.
- **A role granted a data wildcard denies the new table too**, in an app that names the integrations feature: add `integration_frame_grants.*` beside `integrations.*` and `integration_actions.*` (AGENTS.md, rule 10a). The row holds a hash, a principal and a path.
- A frame that was open when a deployment is upgraded holds a grant the old process kept in memory. It is unknown afterwards: the screen is reloaded once.

**An integration's id is a name, and the hash of its key is its own.**

- An id is lower-case letters, digits and hyphens, and starts with a letter: what the paths (`/integrations/<id>/…`) and the action names (`ext.<audience>.<id>.<name>`) already assumed. `POST /operator/integrations` with any other id answers `400` and fetches nothing; a bundle that calls itself anything else is refused at intake.
- An integration that was registered earlier under an id that does not fit goes on being served. It cannot be imported again under that id: remove it and register it under one that fits.
- `nisc.moss` gains a migration: a unique index on `integrations.key_hash` where it is not null. No two integrations hold the hash of one key. Moss mints a key from 32 random bytes and never wrote one hash to two rows; two rows somebody gave the same hash by hand refuse the migration, and one of them is cleared first.

**A set of actions is read by nova's schema before it is taken.**

- `server.replaceActions(source, actions)` verified a set against the charter and froze it, and no schema had read its definitions. One nova refuses was served, and was found when a shell that holds it was built, for whoever connected first. Every definition is read first now: `replaceActions` throws `Refresh refused — actions nova does not read:` with the action and what is wrong with it, and nothing changed.
- `ManifestReport.errors[].check` has a fourth value, `'actions'`, in what `verifyActions` and `verifyApp` answer. Code that switches on `check` gains a case.
- An app whose sets are `ActionDefinition`s nova reads has nothing to change. One that handed over a definition with a field nova does not have corrects the definition.

**The contract lists the fingerprints its caller may replay.**

- `GET /api/integrations/contract` listed every fingerprint the app serves under `fingerprints`, whoever asked: it compiled the caller's policy and then kept every entry. It lists the reads and writes the caller's own policy can touch now, as vex's discovery does for that policy.
- **Asked with no credential, it lists what `public` may replay.** An integration's author asks with the integration's key and `x-nisc-acts-for`, and reads what the integration's actor reaches.
- Intake is as it was: it admits an endpoint that names any fingerprint the app serves. Whether a call is served was, and is, decided by the caller's policy when it is made.

**`FunctionSession` carries no `runtime` and no `policy`.**

- The session an app's `functions` and `onSession` are handed loses two fields. `runtime` was the whole environment: the database pool, the operator key, the signing seed. `policy` was the object the routes enforce for everybody holding those roles. Code that runs for one person was handed what reaches every person's rows, and the one object whose edit would change what the routes allow. A session now says who is calling (`principal`, `roles`, `identity`, `actions`), lends `wire`, `grant`, `revoke`, `recordRun`, and one call that is new.
- **New: `session.answerIntent(writers, asked)`**, for an app that lets a model write a query. `writers` is vex's two seams, `{ generateDsl, mapToShape }`; `asked` is `{ intent, shape, context? }`. The query is written, compiled and run under the policy and the scope values the routes serve the session's principal under, resolved when it is asked, and kept in the cache the routes replay from: `answer.meta.cache.fingerprint` replays over `session.wire` afterwards. It rejects with what vex throws (`code: 'unsatisfiable'`, `'scope_denied'`). Moss keeps one engine for each `writers` object, so hand over the same object each time.
- **What an app calls instead.**
  - It built a second vex engine from `session.runtime.pool` and `session.runtime.cache` and executed with `scopePolicy: session.policy` → `await session.answerIntent({ generateDsl, mapToShape }, { intent, shape })`. Moss builds that engine over its own adapter and cache, with the app's `behaviors` and `runtime.vexConfig`, and hands neither out.
  - It read `session.policy` to know what the caller may read (which feeds, which stored queries to offer) → `server.policyForRoles(session.roles)`: the same policy, compiled for the asking, a copy that is the asker's own.
  - It read `session.runtime` for its own database (minting a session for somebody else, a sync, a raw statement of the deployment's own) → the runtime the app created and handed to `createServer`, closed over where the app builds its manifest. Moss does not hand it back.
- A read or a write as the caller is `session.wire`, as before.

**An event a terminal sends is read by nova's schema before a shell is handed it.**

- The socket holds `event` to being an object and no more; the shell it is dispatched into took whatever arrived. It is now parsed by nova's `NovaEventSchema` first: one of `ui:click`, `ui:submit`, `ui:input`, `ui:focus`, `ui:blur`, `ui:model`, `ui:key`, `ui:drop`, with `ref`, `payload`, `origin` (and `key` on `ui:key`) and no other field. One that does not parse is dropped, as an event naming an instance that is not on its canvas is.
- A terminal built on `@niscorp/moss/client` and one of nova's adapters sends nothing else, and has nothing to change. A terminal written by hand that added a field of its own to an event, or sent a type nova does not define, used to have it dispatched; it sends nova's event.

**A living shell holds what its principal holds now, and nothing that left.**

- When what the app consists of changes (`replaceActions`, `refresh`, an integration approved or removed, a change another process made), every living shell adopts. It used to register what was held and never take anything away: an action that was removed, or that its principal was no longer granted, stayed mounted and pushable in every shell that had it, until that shell was rebuilt. It is now removed from the shell: its instances are unmounted, it leaves the history `back` walks, and a push of it fails as for any action the principal does not hold.
- A shell whose principal could not be resolved during an adopt used to end the walk, and every shell after it kept the old application. It is logged and keeps what it held; the rest adopt.
- A shell that was being built while the app changed adopts when its build lands. Two changes are adopted in the order they happened.
- An action a living shell gains may mention a component no layout mentioned before: it is registered when the shell adopts. The component names a shell is built with are read off the actions in force each time they change, and were read once, when the server started.
- An app has nothing to change. One that relied on a revoked screen staying open until the next sign-in no longer sees it.

**One shell for a principal, and one reset of it at a time.**

- Two first arrivals for one principal in the same moment (a drawn page's read and its socket, two tabs) each built a shell. The second took the first's place and the first was never disposed: its `functions` and `onSession` code ran for as long as the process did. One is built, and both are handed it. `functions` and `onSession` are called once for it.
- Resets that overlapped (`server.invalidateIdentity` twice, or with a terminal's own `reset`) could leave every terminal attached to a shell that was no longer the principal's: nothing they pressed arrived. A shell's resets run in turn.
- A page's shell that was reset lost the parameters of its path and the instance ids its page was drawn with. It is rebuilt with what it was opened with.
- An app has nothing to change.

**The canvases a shell has are the shell's.**

- A canvas a shell gained while it ran (`shell.addCanvas`, or a push to a canvas its manifest does not list) was never sent to a terminal: the host walked the manifest's list. It is rendered, sent, attached to and read by a snapshot like the ones the shell was built with. A canvas that was removed is sent empty once, and no longer handed to a terminal that attaches later.

**A shell is attached to what it uses of a connection.**

- `server.shells.session(…)` answers a session whose `attach`, `detach` and `resync` took the transport's `Connection`. They take what a shell uses of one: `{ send, close, seal? }`. A `Connection` is one of those, so a transport and a check that pass a connection have nothing to change. An object literal written in place with `onMessage` or `onClose` beside them is refused by the compiler, as any literal with a member its type does not have: the shell never called either, and they are dropped.

**A connection that closed before its session was ready leaves nothing attached.**

- Opening a session waits twice: for what somebody holds, then for their shell to be built. A terminal that left in between (a tab closed while its shell was built, a reconnect that gave up) was attached to the shell all the same, and on Node nothing detached it afterwards: `ws` tells a close to whoever is listening when it happens, and the socket started listening after the second wait. A signed-in person's shell then counted a terminal that was not there and was never swept as idle (`runtime.shellIdleMs`); a shell built for nobody was never disposed. The close is heard before either wait now. A connection that closed while its catalog was asked is not handed to a shell host; one that closed while its shell was built is not attached, and the shell idles, or is disposed, at once.
- A transport's `onClose` is called once for a connection, where it was called up to three times. An app and a transport have nothing to change.

**A live connection's credential is asked about by one pass at a time, and a verifier that cannot be asked is in the log.**

- Every `sessionRevalidateMs` the socket asks `session` about each signed-in connection, one after another. The timer started the next pass whether or not that one had finished, so a verifier that took longer than the interval was asked by two passes at once, then three. A pass that is due while one is still asking is skipped now.
- A verifier that throws leaves the connection open, as before. That it threw was dropped without a word; it is logged, once for a pass, with how many connections could not be asked about and the first error.
- A connection whose transport throws when it is told its session expired stayed in the list, so every later pass threw at the same place: no connection after it was asked about again, and the throw was an unhandled rejection. It is forgotten first, closed even if it cannot be told, and what it threw is logged.
- An app has nothing to change.

**A session that could not be opened is a `socket.upgrade` span with the status `error`.**

- A handshake that failed (the verifier threw, what somebody holds could not be asked, their shell could not be built) was refused to its terminal with `session_failed` and a `4500` close, and logged. It emitted no span: with the verifier down, upgrades did not turn into errors on whatever reads `runtime.telemetry`, they stopped being counted. It emits one `socket.upgrade` span now, `status: 'error'`, with `hasPrincipal` as far as the handshake got.
- A sink that counts `socket.upgrade` spans by status gains a value. What the terminal is told has not changed.

**Shells for nobody signed in have a limit: `runtime.anonymousShellMax`, default 1,000.**

- Somebody signed in has one shell, however many terminals they open. Nobody signed in has one for each connection, and opening a connection takes no account and no token: nothing limited how many were alive, so the memory of the process was anybody's to fill.
- New: `runtime.anonymousShellMax`, how many shells for nobody may be alive at once. A connection over it is sent `{ type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' }` and closed with the new close code `4503`. No shell is built for it. Somebody signed in is served whatever the count is.
- **The default is 1,000, from a measurement.** Lyceum's real boot, 2,000 connections for nobody opened through `server.socket` and held, the heap read after a forced collection before and after: 52.5 KB of heap for each (about 110 KB resident); 26.7 KB for an app of one canvas and one action. The Node transport holds about 260 KB resident more for each connection while compression is on. A thousand fit a process given 512 MB.
- **An app with a public screen that more than a thousand visitors have open at once sets `anonymousShellMax`** to what its memory carries (`Infinity` is no limit, as before). A page of the manifest that is not live opens no socket and takes no place.
- A terminal built on `@niscorp/moss/client` has nothing to change: it logs the `error`, and reconnects with its usual backoff, as after any close that is not `4401` or `4403`. A terminal written by hand treats `4503` as a close to retry later, and keeps its token.

**A page whose path names one parameter twice refuses the boot.**

- `path: '/docs/:id/versions/:id'` was accepted, and the canvas its parameters go to was handed one `id`: the later segment's. The first was matched and lost. `createServer` and `createPageRouter` refuse it now: `moss: page "…" names the parameter ":id" twice in "…" — give each parameter of a path its own name.`
- An app with such a path names the second parameter something else. No lab app has one.

**A document's `root` is any empty element, and one with no place for a screen is not reported as drawn.**

- `renderDocument` put the screen into the root by looking for `></div>` in it. A `root` that was another element (`<main id="app"></main>`) was written back as it was, with the snapshot beside it and no screen in it, and the page was reported `drawn: true`: the terminal started from a screen that was not in the page. The screen goes inside any root that is an empty element now, an opening tag and at once its closing tag.
- A `root` with no inside (an opening tag alone, an element that holds something, one closed in its own tag) is answered as a template that does not hold the root always was: the template as it is, `drawn: false`, and one line in the log that names the root.
- An app that passes no `root`, or one that is an empty `div`, sees no difference.

**`DocumentConfig.server` is the three things a document asks, and `createPageRouter` takes what it reads of a page.**

- `renderDocument` and `exportDocuments` took a `MossServer` and called `principalOf`, `page` and `shells` on it. `server` is typed as those three now, and of each shell host as `snapshot` alone. A `MossServer` is one of them: a caller that passes its server has nothing to change, and a check that stood a server up to draw a page can hand over the three.
- `createPageRouter(pages)` took `Record<string, PageManifest>` and read `path`, `params` and each canvas's `id`. It takes a record of those. A record of `PageManifest` is one.
- `tokenFromCookie`, `embedSnapshot`, `documentHeaders`, `renderDocument`, `exportDocuments` and `createPageRouter` are exported from the main entry as before.

**A failure to find out who is calling is `500 identity_failed`, and is logged. It was `401`, and silent.**

- Every HTTP request is identified once, at the door. A token the verifier says is nobody's is a failed sign-in, and is answered `401` `invalid_token`, as before.
- Anything that *threw* while the server found out who is calling was answered `401` `no_identity` too, with nothing in the log: the database being down, the app's `identity.resolve` throwing, an identity record that does not parse. A client that drops its session on a `401` dropped it over a fault of the server's. It is answered `500` `{ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }` now, and the error is logged. None of its text is sent.
- The same answer where the throw used to reach Hono's own handler and came back as the text `Internal Server Error`: a `session` verifier that throws, and a feature's credential (an integration key) that cannot be read or whose principal cannot be resolved.
- **`no_identity` is gone.** An app whose `identity.resolve` throws for a principal it does not know answers a record for nobody instead (`{ roles: ['public'], scope: {} }`), as lyra and lyceum do, or has its `session` verifier answer `null` for the token. Code that matched on `401` `no_identity` matches on `500` `identity_failed`.
- The socket is as it was: a session that cannot be opened is `session_failed` and a `4500` close.

**A lane that throws on a write no longer keeps the other from hearing of it.**

- A committed write is told to the fact lane (the feature that mints it into tide, `createTideFacts`, below) and then to the reactions (`app.reactions`). When the fact lane threw (its `tide()`, `identity(scope)` or `chain` throwing on a scope the app did not expect) no reaction heard of that write, and the throw went to vex. Each is told on its own now: the throw is logged (`[moss:writes] …`) and the reactions run.
- A reaction that throws was already kept from the next reaction, and still is. An app has nothing to change.

**`x-tide-depth` is read as digits, not with `Number()`.**

- A write through vex may name its place in a chain of effects in two headers, `x-tide-cause` and `x-tide-depth`, which the `chain` gate of `createTideFacts` (below) then decides whether to believe. The depth was read with `Number()`: an empty header was depth `0`, the start of a chain, and so `0x2` was 2, `1e1` was 10 and thirty nines a depth no whole number holds. A depth is digits and nothing else now, and a number that is exact. Anything else is no position: `chain` is not asked and the write is heard with none.
- A caller that writes the header as `String(depth)` has nothing to change; lyra's does.

**Tide's hosting is tide's: the store and the driver ship from tide, and the write-fact bridge is a feature, `@niscorp/moss/tide`.**

- Moss held a Postgres store that implements tide's store contract, and a driver that paces tide. They are tide's storage and tide's pacing, and every moss app installed `@niscorp/tide` because of them. Both are in tide now (the tide changeset), under the names they had:
  - `createTideStore`, `TIDE_SEQUENCE`, `TIDE_TABLES`, `TIDE_DDL` → `import … from '@niscorp/tide/postgres'`.
  - `createTideDriver` and the type `TideDriver` → `import … from '@niscorp/tide'`.

  Each is called as it was: `createTideStore(runtime.pool)` takes the pool it took.
- **The tables are the ones the database has.** `TIDE_SEQUENCE` is the same sequence under the same id, `nisc.moss.tide`, with the same migrations in the same order. A deployment that ran it finds nothing pending.
- **`@niscorp/tide` is an optional peer of moss.** An app that runs no tide does not install it, and nothing in moss's main entry imports it. An app that uses `@niscorp/tide/postgres` has `@niscorp/strata` installed, which every moss app does.
- **`NiscApp.facts` is gone: minting a write into tide is a feature.** An app that did it creates the feature and names it in its manifest:

  ```ts
  import { createTideFacts } from '@niscorp/moss/tide';

  const app = defineApp({ charter, actions, features: [createTideFacts({ tide: () => driver, identity, chain })] });
  ```

  `tide`, `identity` and `chain` are the three functions `facts` held, under the names they had, and each is asked what it was asked. A manifest that still names `facts` is refused at boot, as any field the type does not have is: `(the manifest): Unrecognized key: "facts"`.
- **An app that does not name the feature mints nothing.** No write becomes a fact, and a reflex with a `write` trigger is never woken by one.
- A write is told to the features that hear writes, in the order the app named them, and then to `reactions`. That is the order it was told in while the bridge was part of the server.
- New from `@niscorp/moss/tide`: `createTideFacts`, and the types `TideFactsConfig` and `FactIntake`.
- New on `FeatureSeams`: `onWrite(listener)`. A feature of an app's own hears every write the routes serve, once it is committed: what vex reports of it, and the place in a chain of effects the request said it was at. It answers the way to stop hearing.

**The generation counter is read and moved through vex.**

- Every process polls one row, `moss_generation`, to learn that another changed what the app consists of. It was read and moved by statements sent to the pool: the last SQL in moss with no reason to be outside vex. It is two entries of moss's own now, replayed in process under a policy that admits that one table. No route serves them, and no charter has to grant them.
- A move is a compare and a set. Vex's write grammar sets a column to a value and reads none, so it cannot add one: the counter is read, and the next number is written where the counter is still what was read. Where it is not, another process moved it in that instant, and it is read again. Run on PGlite with two servers over one database, both moving at once: the counter went from 1 to 3, and each followed the other.
- The counter is moved through `runtime.db`, the client every write is replayed on. It was `runtime.pool`. An app whose `db` and `pool` reach one database, which is every app there is, sees no difference.
- No span is emitted for the counter's reads and moves, as none was: a poll is not something a request did.
- A counter that could not be moved after five tries in a row is logged (`[moss:generation] could not move the pointer`). A row somebody deleted used to be moved without a word, and nothing was moved.
- An app has nothing to change. A role granted a data wildcard still denies `moss_generation.*` (AGENTS.md, rule 10a).

**`serve` stops what it started, and takes the message limit: `runtime.socketMaxMessageBytes`.**

- `serve(app, runtime)` (`@niscorp/moss/node`) makes an HTTP listener and a websocket transport and returns the server and neither of them. `server.close()` stopped moss's timers and left the port bound and every terminal connected, and nothing else could reach either. `close()` on the server `serve` returns now stops all three: moss's own timers, then every connection (closed `1001`), then the listener.
- New: `runtime.socketMaxMessageBytes`, the largest message a connection may send. `serve` hands it to the transport, as it hands `runtime.socketCompression`. It could be said to `attachSocket` (`maxMessageBytes`) and not to `serve`, which calls it. Unset, the limit is the transport's 256 KiB, as before.
- `attachSocket(…)` answers `{ close }` where it answered nothing: `close()` ends every connection the transport opened (`1001`) and takes no more. A host that ignores what it answers has nothing to change.
- An app that called `server.close()` on a server from `serve` and went on using the port has to stop doing one of the two. `createServer`'s own `close` is as it was. `nisc start` and the dev plugin call `attachSocket` themselves, with no options, and are not changed here.
