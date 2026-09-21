import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// THE THREAD, as two entries. The text model's memory is rows, written and read
// through the same governed wire as everything else — so it survives a restart
// of the shell, belongs to one principal (vex/behaviors.ts stamps and fences
// it), and can be inspected with a query instead of a debugger.
//
// NEWEST FIRST, with a limit: the run wants the last twenty turns, and an
// ascending sort with a limit would hand back the FIRST twenty ever said. The
// reader reverses them.
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

// One turn. `principal` is not here and cannot be: the engine writes it from
// the session on every insert.
export const threadAppend: SeedMutation = {
  fingerprint: 'agent/appendTurn',
  intent: 'Append one turn to the caller\'s own conversation with the room',
  mutation: {
    op: 'insert',
    table: 'agent_turns',
    values: { role: { $context: 'role' }, body: { $context: 'body' }, detail: { $context: 'detail' } },
  },
};
