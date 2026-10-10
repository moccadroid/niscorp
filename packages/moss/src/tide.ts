import type { Tide } from '@niscorp/tide';
import type { WriteEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// The write-fact bridge — vex's write observer, minted into tide.
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
// ═══════════════════════════════════════════════════════════════
// `chain` is the causality thread: when the write came from a tide effect
// (the handler forwarded its task and depth, the app's gate vouched for the
// caller), the minted facts carry `cause: task:<id>` and `depth + 1` — the
// same stamps an in-engine emit gets — so the chain ceiling holds across a
// trip through the database instead of resetting at every hop.
export const mintWrites = async (
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
