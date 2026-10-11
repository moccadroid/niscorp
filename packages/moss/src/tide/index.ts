// ═══════════════════════════════════════════════════════════════
// TIDE'S FACTS — a committed write, minted into tide.
//
// What moss has of hosting tide is a FEATURE: an app that runs tide creates it
// and names it in its manifest's `features`.
//
//   features: [createTideFacts({ tide: () => driver, identity, chain })]
//
// Tide's Postgres store and its driver are tide's own
// (`@niscorp/tide/postgres`, `createTideDriver`). This is the glue only a
// host can be: vex reports a write, and each row it returned becomes a
// `{ kind: 'write' }` fact (./mint.ts), for the identity the app reads off
// the write's scope (./feature.ts), at the place in a chain the request that
// wrote named in the two headers that are this feature's (./chain.ts).
// ═══════════════════════════════════════════════════════════════

// THIS FILE IS AN ENTRY POINT: `@niscorp/moss/tide`. What it exports is what
// an app calls, and `packages/moss/api.txt` lists it. The module is named for
// that entry point, which is named as `./node` and `./vite` are, for what
// stands on the other side of it: apps import the path, and a directory under
// another name would be one more word for the same thing.
//
// This module imports `feature`, and nothing else of moss: it hears a write
// through the seam it is handed. Of `@niscorp/tide` it imports one type, so
// tide is an optional peer of moss, installed by an app that runs it. Nothing
// of moss's core imports this module: `pnpm check:modules` fails if something
// does.

export { createTideFacts } from './feature';
export type { TideFactsConfig } from './feature';
