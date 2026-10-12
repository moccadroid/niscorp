import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export const turnsMine: SeedEntry = {
  fingerprint: 'turns/mine',
  refresh: 'reactive',
  intent: "This person's last five turns with the assistant, oldest first",
  shape: [{ turn_id: '', message: '', reply: '', outcome: '', opened: [], writer_answer: {}, writer_reasoning: '', asked_at: '' }],
  dsl: {
    from: ['assistant_turns'],
    fields: ['assistant_turns.turn_id', 'assistant_turns.message', 'assistant_turns.reply', 'assistant_turns.outcome', 'assistant_turns.opened', 'assistant_turns.writer_answer', 'assistant_turns.writer_reasoning', 'assistant_turns.asked_at'],
    sort: [{ field: 'assistant_turns.asked_at', dir: 'desc' }, { field: 'assistant_turns.turn_id', dir: 'desc' }],
    limit: 5,
  },
  mapping: { $sortBy: { over: { $ref: '$.result' }, as: 'turn', by: { $get: { from: { $var: 'turn' }, path: ['asked_at'] } } } },
};

export const turnRecord: SeedMutation = {
  fingerprint: 'turns/record',
  intent: 'Record a turn of the conversation: what was said, replied, proposed, queried, and what the automation writer answered and why',
  mutation: {
    op: 'insert',
    table: 'assistant_turns',
    values: {
      turn_id: { $context: 'turnId' },
      message: { $context: 'message' },
      reply: { $context: 'reply' },
      proposals: { $context: 'proposals' },
      opened: { $context: 'opened' },
      writer_answer: { $context: 'writerAnswer' },
      writer_reasoning: { $context: 'writerReasoning' },
    },
  },
};

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
