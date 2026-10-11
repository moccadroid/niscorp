import type { Data } from '../data';
import type { NiscApp } from '../manifest';

// ═══════════════════════════════════════════════════════════════
// WHAT THE APP DECLARED IT WANTS TO HEAR OF A WRITE. Vex reports each
// committed mutation once, with per-statement writes, and the data module
// hands it to whoever subscribed.
//
// THE REACTIONS are row-less by design and routed by declared interest:
// table, op, count, scope, with `deliver` to push onto living shells. A
// receiver that wants data re-reads it under its own policy.
//
// Subscribed once the shells stand, which a reaction delivers into, and after
// the features have started: a feature that hears writes (the one that mints
// them into tide as facts, ../feature's `onWrite` seam) subscribed first, so
// it is told of a write before the reactions are. Each is told on its own
// either way.
//
// The rows of a write go to a feature that asks for them and nowhere else.
// Nothing here knows what tide is.
// ═══════════════════════════════════════════════════════════════

export type ReactionDeps = {
  app: Pick<NiscApp, 'reactions'>;
  onWrite: Data['onWrite'];
  // Push onto one principal's living shell, in this process and every other
  // (./signals.ts). What a reaction is handed as `deliver`.
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export const subscribeReactions = ({ app, onWrite, deliver }: ReactionDeps): void => {
  const reactions = app.reactions;
  if (reactions === undefined) return;
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
};
