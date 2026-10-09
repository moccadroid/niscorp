---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss is rebuilt as modules, and its public API is what an app is meant to call. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-09: import only what `@niscorp/moss` still exports (the list is `packages/moss/api.txt`); the changes an app has to make are listed below, one per part.

Moss had grown to twenty-eight files flat in `src/`, one of them a single function of 1,345 lines, and it exported 135 names of which 71 were imported by nothing outside the package. `docs/plans/moss-refactor.md` is the audit and the plan.

**The main entry exports 61 names, not 135.**

- Gone, and never part of what an app calls: `createShellHost`, `createSocket`, `createDataLayer`, `createGeneration`, `createIdentityCache`, `wireFabric`, `runIntake`, `copyPress`, `callIntegrationWith`, `initIntegrations`, `listIntegrations`, `loadIntegrationActions`, `filterInstalled`, `buildContract`, `contractAsMarkdown`, `describePlacements`, `verifyAssertion`, `mintIntegrationKey`, `hashIntegrationKey`, `mintWrites`, `revokeSession`, `sessionVerifierOf`, `shellNeedOf`, `emitterOf`, `spanClock`, `resolvePolicyAtReach`, `resolveVariantsForRoles`, the constants `GENERATION_DDL`, `SESSIONS_SEQUENCE`, `SNAPSHOT_ELEMENT_ID`, `CLOSE_SHELL_FAILED`, `DEFAULT_GENERATION_POLL_MS`, `DEFAULT_IDENTITY_IDLE_MS`, `DEFAULT_IDENTITY_MAX`, `DEFAULT_IDLE_MS`, `DEFAULT_REVALIDATE_MS`, and the types that went with them.
- An app that imported one of these was reaching into moss. Say which and why in an issue; the answer is a call that is meant to be public, not the name coming back.

**A message on the socket is read whole, by a schema, or not at all.**

- The server parses what a terminal sends. A message with a field the protocol does not name used to be routed with that field ignored; it is now answered `invalid_message` and nothing of it is acted on.
- A terminal built on `@niscorp/moss/client` sends no such message, and has nothing to change. A terminal written by hand sends exactly one of `{ type: 'event', canvas, event }`, `{ type: 'publish', channel, payload? }`, `{ type: 'popTo', canvas, instance }`, `{ type: 'back' }`, `{ type: 'resync' }`, `{ type: 'reset' }`, and nothing beside those fields. What is inside `event` is not narrowed: it is still any object.
- `invalid_message` is one sentence for every message that cannot be read. An event whose `event` is not an object used to get a sentence of its own, with its `canvas` on the reply; it gets the same answer as the rest.
- The terminal (`@niscorp/moss/client`) parses what the server sends, and the screen a drawn page carries. A message it cannot read is named by its type in the console and dropped: a tree holding something that is not one of nova's four nodes, or a node with a field nova's node does not have, used to be handed to the kit and is now not shown. An app has nothing to change.
- `readDocumentSnapshot` answers `undefined` for a snapshot that does not parse whole. It used to drop a `seed`, `path` or `live` of the wrong type and start from the rest.
- The terminal now runs zod in the page. Zod was already a peer every app installs; a page whose content security policy forbids `eval` may see zod's one probe for it reported, and sets `z.config({ jitless: true })` in its entry to skip the probe.

**A failure on the socket stays one terminal's, and its text stays on the server.**

- A message the server reads and then throws on used to let the throw out into the transport's listener, where Node ends the process and every session with it. It is now logged, and the terminal is sent an `error` with the code `message_failed`; the connection stays open. An app has nothing to change.
- A session the server could not open used to send the terminal the error's own text, which can name a host, a table or a database user. The `session_failed` error now says only that the session was refused, and the error is in the server's log. It still names the definitions that failed validation, when that is the cause. An app has nothing to change.

**The record `identity.resolve` answers is read by a schema.**

- `roles` is a list of strings, `scope` an object, `installed` (when there) a list of strings, `tag` (when there) a string. A record that does not fit is refused with a sentence that names the field, and nothing is held for that principal: a session token whose principal resolves to such a record gets 401 `no_identity`, as for any principal the app cannot resolve. It used to be carried on as it was, and failed later, somewhere else, or not at all.
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
- A field the type does not have is refused, on the manifest itself, on the shell or a page, on a canvas, a layout variant, an entry, a reaction, `identity`, `facts` and `phraseKeys`. The compiler already refuses one written in place; one that arrived through a spread or a cast used to be carried and ignored. An app that kept something of its own there keeps it beside the manifest. A component's contract (`shell.components`) and a resource written as an object may still carry more than moss names.
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
