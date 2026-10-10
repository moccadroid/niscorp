// ═══════════════════════════════════════════════════════════════
// INTEGRATIONS — actions and layouts that arrive from somewhere else.
//
// An integration is a SEPARATE SERVICE. Its own repository, its own storage,
// its own deploy cycle, on its own machine. It shares no code with the app it
// extends: everything crosses a wire.
//
// That constraint decides the whole design, and most of it is subtraction:
//
//   IT SHIPS ACTIONS AND LAYOUTS. Nothing else. It cannot ship a vex entry,
//   because an entry is a compiled query authored against a schema it cannot
//   import, and the generation path is deliberately unwired. It calls what
//   discovery advertises, and if it needs a read that does not exist, that is a
//   change to the app rather than to the integration.
//
//   IT BRINGS ITS OWN STORAGE. A feature needing a column beside the app's is a
//   migration in the app, not an integration. Anything else lives on the other
//   side of the wire, keyed by identifiers we hand over.
//
//   IT ANNOUNCES; WE FETCH. There is no poll and no boot-time sweep. Registering
//   IS the announcement, it is idempotent, and re-importing is the same call.
//
//   IT REACHES EXACTLY TWO PLACES. A fingerprint the app already serves, or a
//   URL under its own prefix. Every endpoint on every action it ships is checked
//   against that at intake.
//
// Two credentials, revocable at different granularities. The integration's own
// KEY is long-lived: it acts as itself, as a principal with a charter rung, for
// work nobody asked for (a nightly sync). A per-request TOKEN is minted by the
// proxy when a person is driving: it acts on behalf of them, it lasts seconds,
// and it is only valid while the key that owns it is — so revoking one key
// kills every token it holds without storing any of them.
// ═══════════════════════════════════════════════════════════════

// THIS FILE IS AN ENTRY POINT: `@niscorp/moss/integrations`. What it exports
// is what an app calls, and `packages/moss/api.txt` lists it. Everything else
// in this directory is reached by the feature itself.
//
// This module imports `runtime`, `feature` and `manifest`. It imports nothing
// of `data`: what it reads and writes it authors as vex entries (./entries.ts)
// and replays through the seam it is handed. Nothing of moss's core imports
// it: `pnpm check:modules` fails if something does.

export type { CallIntegration } from './call';
export { createAssertionSigner } from './credentials';
export { createIntegrations } from './feature';
export type { Integrations, IntegrationsConfig } from './feature';
export { integrationOfAction } from './installed';
export type { StorePress } from './press';
