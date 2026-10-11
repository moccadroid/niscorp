import type { Tide } from '@niscorp/tide';
import type { WriteEvent } from '@niscorp/vex';
import type { Feature, FeatureSeams } from '../feature';

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
// It needs one thing of the core, to hear a write (../feature, the `onWrite`
// seam), so it is a feature: an app that runs no tide names none, and moss's
// core imports nothing of tide.
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
  seams.onWrite((event, request) => {
    const tide = config.tide();
    const as = tide !== undefined ? config.identity(event.scope) : undefined;
    if (tide === undefined || as === undefined) return;
    // The chain position the request named in this feature's own two headers
    // (`chainHintsOf`, below), if the app's gate takes that caller's word for
    // it.
    const hints = chainHintsOf(request);
    const chain = hints === undefined ? undefined : config.chain?.(event.scope, hints);
    mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
  });

export const createTideFacts = (config: TideFactsConfig): Feature => ({
  name: 'tide-facts',
  start: (seams) => {
    mintFromWrites(config, seams);
  },
});

// THE PLACE IN A CHAIN OF EFFECTS A REQUEST NAMED.
//
// A tide effect that writes back through vex says where in a chain it is, in
// two headers of its request: `x-tide-cause`, the task that caused the write,
// and `x-tide-depth`, how many hops in that task is. They are this feature's
// headers, and it is this file that knows their names and reads them: the core
// hands on what a request said (../feature, the `onWrite` seam) and reads no
// header of anybody's.
//
// What they say is the caller's word. Whether it is believed is the app's
// `chain` gate (`TideFactsConfig.chain`, above).

export type ChainHints = { cause: string; depth: number };

// HOW DEEP IN A CHAIN A REQUEST SAYS IT IS: a whole number that is not
// negative, written as `String(depth)` writes one — digits and nothing else.
// Read by its form and not with `Number()`, which reads more than a number:
// an empty header is 0 to it, and 0 is the start of a chain, so a chain whose
// depth is lost on the way would be counted from the beginning again, under a
// ceiling that exists to stop it. Undefined: the header names no depth.
const depthOf = (header: string | undefined): number | undefined => {
  if (header === undefined || !/^\d+$/.test(header)) return undefined;
  const depth = Number(header);
  return Number.isSafeInteger(depth) ? depth : undefined;
};

// The position a request named, or undefined when it named none that reads
// as one: no cause, an empty one, or a depth that is not a depth.
const chainHintsOf = (request: { header: (name: string) => string | undefined }): ChainHints | undefined => {
  const cause = request.header('x-tide-cause');
  const depth = depthOf(request.header('x-tide-depth'));
  return cause === undefined || cause === '' || depth === undefined ? undefined : { cause, depth };
};

// THE WRITE-FACT BRIDGE — vex's write observer, minted into tide.
//
// One fact per (statement × returned row): a two-statement mutation
// is two stimuli, and an UPDATE the scope narrowed to nothing is
// none — zero rows mint zero facts, so "a write landed" is never
// said about a write that changed nothing.
//
// `as` is the fact's identity fence. Tide offers a fact only to
// reflexes running AS the same identity, and consults no scope
// policy on the way (the row travels unread) — so the stamp here,
// derived from the WRITE's own scope by the app's naming rule, is
// what keeps one tenant's row out of another tenant's automation.
// Stamping by anything else (a listener's interest, a default)
// would walk data across that fence.
//
// `chain` is the causality thread: when the write came from a tide effect
// (the handler forwarded its task and depth, the app's gate vouched for the
// caller), the minted facts carry `cause: task:<id>` and `depth + 1` — the
// same stamps an in-engine emit gets — so the chain ceiling holds across a
// trip through the database instead of resetting at every hop.
const mintWrites = async (
  intake: Pick<Tide, 'ingest'>,
  event: WriteEvent,
  as: string,
  at: number,
  chain?: { cause: string; depth: number },
): Promise<void> => {
  for (const write of event.writes) {
    for (const row of write.rows) {
      await intake.ingest(
        { kind: 'write', entity: write.table, op: write.op, row, at },
        { as, ...(chain !== undefined ? { cause: chain.cause, depth: chain.depth + 1 } : {}) },
      );
    }
  }
};
