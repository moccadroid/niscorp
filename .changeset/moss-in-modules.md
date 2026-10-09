---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss is rebuilt as modules, and its public API is what an app is meant to call. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-09: import only what `@niscorp/moss` still exports (the list is `packages/moss/api.txt`); the changes an app has to make are listed below, one per part.

Moss had grown to twenty-eight files flat in `src/`, one of them a single function of 1,345 lines, and it exported 135 names of which 71 were imported by nothing outside the package. `docs/plans/moss-refactor.md` is the audit and the plan.

**The main entry exports 66 names, not 135.**

- Gone, and never part of what an app calls: `createShellHost`, `createSocket`, `createDataLayer`, `createGeneration`, `createIdentityCache`, `wireFabric`, `runIntake`, `copyPress`, `callIntegrationWith`, `initIntegrations`, `listIntegrations`, `loadIntegrationActions`, `filterInstalled`, `buildContract`, `contractAsMarkdown`, `describePlacements`, `verifyAssertion`, `mintIntegrationKey`, `hashIntegrationKey`, `mintWrites`, `revokeSession`, `sessionVerifierOf`, `shellNeedOf`, `emitterOf`, `spanClock`, `resolvePolicyAtReach`, `resolveVariantsForRoles`, the constants `GENERATION_DDL`, `SESSIONS_SEQUENCE`, `SNAPSHOT_ELEMENT_ID`, `CLOSE_SHELL_FAILED`, `DEFAULT_GENERATION_POLL_MS`, `DEFAULT_IDENTITY_IDLE_MS`, `DEFAULT_IDENTITY_MAX`, `DEFAULT_IDLE_MS`, `DEFAULT_REVALIDATE_MS`, and the types that went with them.
- An app that imported one of these was reaching into moss. Say which and why in an issue; the answer is a call that is meant to be public, not the name coming back.

**A message on the socket is read whole, by a schema, or not at all.**

- The server parses what a terminal sends. A message with a field the protocol does not name used to be routed with that field ignored; it is now answered `invalid_message` and nothing of it is acted on.
- A terminal built on `@niscorp/moss/client` sends no such message, and has nothing to change. A terminal written by hand sends exactly one of `{ type: 'event', canvas, event }`, `{ type: 'publish', channel, payload? }`, `{ type: 'popTo', canvas, instance }`, `{ type: 'back' }`, `{ type: 'resync' }`, `{ type: 'reset' }`, and nothing beside those fields. What is inside `event` is not narrowed: it is still any object.
- `invalid_message` is one sentence for every message that cannot be read. An event whose `event` is not an object used to get a sentence of its own, with its `canvas` on the reply; it gets the same answer as the rest.
- The terminal (`@niscorp/moss/client`) parses what the server sends, and the screen a drawn page carries. A message it cannot read is named by its type in the console and dropped: a tree holding something that is not one of nova's four nodes, or a node with a field nova's node does not have, used to be handed to the kit and is now not shown. An app has nothing to change.
- `readDocumentSnapshot` answers `undefined` for a snapshot that does not parse whole. It used to drop a `seed`, `path` or `live` of the wrong type and start from the rest.
- The terminal now runs zod in the page. Zod was already a peer every app installs; a page whose content security policy forbids `eval` may see zod's one probe for it reported, and sets `z.config({ jitless: true })` in its entry to skip the probe.
