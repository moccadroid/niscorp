import type { Tide } from '@niscorp/tide';
import type { Feature, FeatureSeams } from '../feature';
import { mintWrites } from './mint';

// ═══════════════════════════════════════════════════════════════
// THE FEATURE — a committed write becomes tide facts, as one object an app
// creates and puts in its manifest's `features`.
//
// Vex is the choke point every write passes through. When an app runs tide,
// each committed statement is minted into it as a `{ kind: 'write' }` fact —
// entity, op, and the row the database returned — stamped with the identity
// `identity(scope)` names. That identity is the fact's tenancy fence: tide
// offers a fact only to reflexes running AS the same identity, so whose write
// it was decides who may be woken by it.
//
// Rows travel HERE and into tide's ledger only: host plumbing on one side,
// the identity fence on the other.
//
// It was three functions on the manifest (`NiscApp.facts`), read by the
// server. It needs one thing of the core, to hear a write (../feature, the
// `onWrite` seam), so it is a feature: an app that runs no tide names none,
// and moss's core imports nothing of tide.
// ═══════════════════════════════════════════════════════════════

// The one verb the bridge needs. Both `Tide` and `TideDriver` satisfy it;
// hand out the driver unless you have a reason to want facts that wait.
export type FactIntake = Pick<Tide, 'ingest'>;

export type TideFactsConfig = {
  // WHERE A FACT IS MINTED INTO. A getter, because the instance stands up
  // after the server does: while it answers `undefined`, nothing is minted (a
  // write made while the app boots is not an event). Hand back the tide
  // DRIVER, so a minted fact wakes the engine instead of waiting for
  // anybody's beat.
  tide: () => FactIntake | undefined;
  // WHOSE FACT IT IS, read off the write's own scope: the values the engine
  // stamped, which no request could forge. Returning `undefined` mints nothing
  // for that write (an operator surface, a write with no tenant).
  identity: (scope: Record<string, unknown>) => string | undefined;
  // THE CAUSALITY GATE. A tide effect that writes back through vex forwards
  // its chain position as request headers (`x-tide-cause`, `x-tide-depth`);
  // this decides whether THAT CALLER's word is good — return the hints to
  // accept them onto the minted facts, undefined to drop them. Absent = hints
  // are always dropped, which is the safe default: a forged depth could park
  // an innocent chain, and a forged cause is fabricated provenance. An app
  // grants this to exactly the principals that ARE its automation rungs.
  chain?: (scope: Record<string, unknown>, hints: { cause: string; depth: number }) => { cause: string; depth: number } | undefined;
};

// WHAT STARTING IT IS: subscribe to the writes. It takes the one seam it uses,
// so it can be held against that seam and nothing else. Returns the way to
// stop hearing.
export const mintFromWrites = (config: TideFactsConfig, seams: Pick<FeatureSeams, 'onWrite'>): (() => void) =>
  seams.onWrite((event, hints) => {
    const tide = config.tide();
    const as = tide !== undefined ? config.identity(event.scope) : undefined;
    if (tide === undefined || as === undefined) return;
    // The chain position the request named, if the app's gate takes that
    // caller's word for it.
    const chain = hints === undefined ? undefined : config.chain?.(event.scope, hints);
    mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
  });

export const createTideFacts = (config: TideFactsConfig): Feature => ({
  name: 'tide-facts',
  start: (seams) => {
    mintFromWrites(config, seams);
  },
});
