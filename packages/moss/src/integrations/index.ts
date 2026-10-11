// ═══════════════════════════════════════════════════════════════
// INTEGRATIONS — actions and layouts that arrive from somewhere else.
//
// An integration is a SEPARATE SERVICE. Its own repository, its own storage,
// its own deploy cycle, on its own machine. It shares no code with the app it
// extends: everything crosses a wire.
//
//   IT SHIPS ACTIONS AND LAYOUTS, and its words for them. It cannot ship a vex
//   entry: an entry is a compiled query authored against a schema it cannot
//   import. It calls what the contract lists, and a read that does not exist
//   is a change to the app.
//
//   IT BRINGS ITS OWN STORAGE. Whatever it keeps lives on the other side of the
//   wire, keyed by identifiers the app hands over.
//
//   IT ANNOUNCES; THE APP FETCHES. There is no poll and no sweep at boot.
//   Registering is the announcement, and importing again is the same call.
//
//   IT REACHES EXACTLY TWO PLACES. A fingerprint the app serves, or a URL under
//   its own prefix. Every endpoint of every action it ships is held to that at
//   intake.
//
//   WHAT ELSE A BUNDLE SAYS IS THE HOST APP'S. A store listing, where a screen
//   is placed, a setting a person may change: one app's vocabulary, carried
//   under `extension`, read by a schema that app supplies, and kept on the
//   integration's row for the app to read back.
//
// Two credentials. The integration's own KEY is long-lived: it acts as itself,
// as a principal with a charter rung, for work nobody asked for (a nightly
// sync). An ASSERTION is minted for each call the app forwards: it says who is
// driving, lasts seconds, and is verified with a public key the app serves.
// ═══════════════════════════════════════════════════════════════

// THIS FILE IS AN ENTRY POINT: `@niscorp/moss/integrations`. What it exports
// is what an app calls, and `packages/moss/api.txt` lists it. Everything else
// in this directory is reached by the feature itself.
//
// WHAT EACH FILE BEHIND THIS DOOR IS FOR:
//
//   feature.ts      createIntegrations: what an app says about itself, and
//                   everything the feature adds through its seams
//   bundle.ts       the fields of what an integration publishes
//   intake.ts       the gate: a bundle lands whole or not at all, held to moss's
//                   checks and to the app's own for its `extension`
//   reach.ts        what a bundle may be called at, from what its actions declare
//   entries.ts      every read and write on the feature's two tables, as vex
//                   entries
//   registry.ts     each thing asked of those tables, as a function that replays
//                   an entry and reads the rows by a schema; the documents kept
//                   in them; and which integration an action belongs to
//   operator.ts     the operator's routes (register, approve, remove, list,
//                   probe), and the contract a vendor builds against
//   forward.ts      the one way out to an integration's own service, and the
//                   doors that use it: a screen's call through the proxy, a
//                   vendor's webhook, the app's own call when nobody is driving;
//                   and the sentence put under a call that failed with none
//   credentials.ts  the signed assertion of who is calling, the key an
//                   integration is issued, and who it is when it acts alone
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
export type { ExtensionConfig, ExtensionContext } from './intake';
export type { RegisteredIntegration } from './registry';
