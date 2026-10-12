import type { Data } from '../data';
import type { NiscApp } from '../manifest';

export type ReactionDeps = {
  app: Pick<NiscApp, 'reactions'>;
  onWrite: Data['onWrite'];
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
