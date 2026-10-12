import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// Newest first, with a limit: an ascending sort with a limit would hand back the
// first turns ever said. The reader reverses them.
export const threadTurns: SeedEntry = {
  fingerprint: 'agent/turns',
  intent: 'The most recent turns of the caller\'s own conversation with the room, newest first',
  shape: [{ seq: 0, role: '', body: '', detail: '' }],
  dsl: {
    from: ['agent_turns'],
    fields: ['agent_turns.seq', 'agent_turns.role', 'agent_turns.body', 'agent_turns.detail'],
    sort: [{ field: 'agent_turns.seq', dir: 'desc' }],
    limit: 60,
  },
};

// `principal` is not here and cannot be: the engine writes it from the session
// on every insert.
export const threadAppend: SeedMutation = {
  fingerprint: 'agent/appendTurn',
  intent: 'Append one turn to the caller\'s own conversation with the room',
  mutation: {
    op: 'insert',
    table: 'agent_turns',
    values: { role: { $context: 'role' }, body: { $context: 'body' }, detail: { $context: 'detail' } },
  },
};
