import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the assistant's conversations ──
//
// A turn is a row, written as the person asking; they read only their own
// (behaviors.ts pins every read and write to `member_id` = their userId). The
// history under the assistant is `turns/mine`, reactive — a turn recorded, or
// its outcome set, reaches the screen with nobody announcing it — and the model
// is handed the same rows as the conversation so far.

export const turnsMine: SeedEntry = {
  fingerprint: 'turns/mine',
  refresh: 'reactive',
  intent: 'This person\'s conversation with the assistant, newest first',
  shape: [{ turn_id: '', message: '', reply: '', outcome: '' }],
  dsl: {
    from: ['assistant_turns'],
    fields: ['assistant_turns.turn_id', 'assistant_turns.message', 'assistant_turns.reply', 'assistant_turns.outcome'],
    sort: [{ field: 'assistant_turns.asked_at', dir: 'desc' }, { field: 'assistant_turns.turn_id', dir: 'desc' }],
    limit: 20,
  },
};

// Record a turn, as the person asking — `member_id` is stamped.
export const turnRecord: SeedMutation = {
  fingerprint: 'turns/record',
  intent: 'Record a turn of the conversation: what was asked, replied and proposed',
  mutation: {
    op: 'insert',
    table: 'assistant_turns',
    values: {
      turn_id: { $context: 'turnId' },
      message: { $context: 'message' },
      reply: { $context: 'reply' },
      proposals: { $context: 'proposals' },
    },
  },
};

// What came of a turn — set when the person acts on its proposal. Only their
// own turn can be reached (behaviors.ts).
export const turnResolve: SeedMutation = {
  fingerprint: 'turns/resolve',
  intent: 'Set what came of a turn of the conversation',
  mutation: {
    op: 'update',
    table: 'assistant_turns',
    set: { outcome: { $context: 'outcome' } },
    where: { eq: ['assistant_turns.turn_id', { $context: 'turnId' }] },
  },
};

export const ASSISTANT_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [turnsMine, turnRecord, turnResolve];
