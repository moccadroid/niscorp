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
