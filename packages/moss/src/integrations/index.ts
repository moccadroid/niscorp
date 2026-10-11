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
// WHAT EACH FILE BEHIND THIS DOOR IS FOR, in the order a bundle meets them:
//
//   the feature
//     feature.ts           — createIntegrations: what an app says about itself,
//                            and everything the feature adds through its seams
//     tables.ts            — the two tables it keeps, and the documents in them
//     entries.ts           — every read and write on those tables, as vex entries
//     registry.ts          — each thing asked of those tables, as a function that
//                            replays an entry and reads the rows by a schema
//
//   a bundle arriving
//     bundle.ts            — the grammar of what an integration publishes
//     intake.ts            — the gate: a bundle lands whole or not at all
//     reach.ts             — what a bundle may be called at, from what it declares
//     press.ts             — a listing's images, copied once at intake
//     placements.ts        — the sentence that says what appears where
//     contract.ts          — what an author builds against: the components and
//                            fingerprints the host offers, as JSON and Markdown
//     operator.ts          — the operator's routes: register, approve, revoke
//
//   who is who
//     credentials.ts       — the signed assertion of who is calling, and the key
//                            an integration is issued
//     actor.ts             — who an integration is when it acts and nobody drives
//     installed.ts         — which integration an action belongs to, and which
//                            actions are there for an install list
//
//   a call crossing
//     forward.ts           — the one way out to an integration's own service
//     proxy.ts             — a screen calling out, and a vendor's webhook coming in
//     call.ts              — the deployment's own call, when nobody is driving
//     fallback-message.ts  — the sentence put under a call that failed with none
//
// This module imports `runtime` (where a span goes) and `feature` (what it is
// started with), and nothing else of moss: what a feature anybody writes may
// import. Nothing of `data`: what it reads and writes it authors as vex
// entries (./entries.ts) and replays through the seam it is handed. Nothing of
// `manifest`: what intake asks about a bundle (does a layout fit the kit,
// which chains of steps never end) it asks through two seams. Nothing of
// moss's core imports it: `pnpm check:modules` fails if something does.

export { createAssertionSigner } from './credentials';
export { createIntegrations } from './feature';
export type { Integrations, IntegrationsConfig } from './feature';
export type { StorePress } from './press';
