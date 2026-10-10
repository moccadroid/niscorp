import type { Data } from '../data';
import type { NiscApp } from '../manifest';
import { mintWrites } from '../tide';

// ═══════════════════════════════════════════════════════════════
// WHAT HEARS A WRITE. Vex reports each committed mutation once, with
// per-statement writes, and the data module hands it to whoever subscribed,
// in this order of record:
//
//   1. The FACT lane — rows ride here and into tide's ledger only,
//      stamped with the identity the app derives from the write's
//      own scope. That stamp is the tenancy fence (see mintWrites).
//   2. The REACTIONS — row-less by design and routed by declared
//      interest: table, op, count, scope, with `deliver` to push
//      onto living shells. A receiver that wants data re-reads it
//      under its own policy.
//
// Subscribed once the shells stand, which a reaction delivers into. Tide is
// late-bound: it is asked when a write is heard.
// ═══════════════════════════════════════════════════════════════

export type LaneParts = {
  app: Pick<NiscApp, 'facts' | 'reactions'>;
  onWrite: Data['onWrite'];
  // Push onto one principal's living shell, in this process and every other
  // (./signals.ts). What a reaction is handed as `deliver`.
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export const hearWrites = ({ app, onWrite, deliver }: LaneParts): void => {
  const facts = app.facts;
  if (facts !== undefined) {
    onWrite((event, hints) => {
      const tide = facts.tide();
      const as = tide !== undefined ? facts.identity(event.scope) : undefined;
      if (tide === undefined || as === undefined) return;
      // The chain position the request named, if the app's gate takes that
      // caller's word for it.
      const chain = hints === undefined ? undefined : facts.chain?.(event.scope, hints);
      mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
    });
  }
  const reactions = app.reactions;
  if (reactions !== undefined) {
    onWrite((event) => {
      const tools = { deliver };
      for (const write of event.writes) {
        if (write.rows.length === 0) continue;
        for (const reaction of reactions) {
          if (reaction.table !== write.table || (reaction.op !== undefined && reaction.op !== write.op)) continue;
          try {
            reaction.run({ fingerprint: event.fingerprint, table: write.table, op: write.op, count: write.rows.length, scope: event.scope }, tools);
          } catch (err) {
            console.error('[moss:reactions]', err);
          }
        }
      }
    });
  }
};
