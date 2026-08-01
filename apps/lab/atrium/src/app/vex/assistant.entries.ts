import type { CacheEntry, MutationEntry } from './index';
import { stampText } from '@atrium/app/prisms/format.prism';

// The assistant's surface — persona rows and the durable conversation.
//
// Note what is ABSENT from every context here: a user id. `assistant_turns` is
// the app's one personal table, and its rows are pinned to the caller by the
// user-shaped scope behavior — reads filtered to yours, writes stamped as
// yours, engine-side. A client (or a confused model) cannot read another
// principal's conversation or write into it, because the pin is not in the
// request.

// The persona for an audience. Character is voice; abilities are derived per
// session, never stored.
export const assistantPersona: CacheEntry = {
  fingerprint: 'assistant/persona',
  intent: "An audience's assistant persona: name, character, model, provider",
  shape: { assistant_id: '', name: '', character: '', model: '', provider: '' },
  dsl: {
    from: ['assistants'],
    fields: [{ field: 'assistants.id', as: 'assistant_id' }, 'assistants.name', 'assistants.character', 'assistants.model', 'assistants.provider'],
    filter: { eq: ['assistants.audience', { $context: 'audience' }] },
    limit: 1,
  },
  mapping: { $ref: '$.result' },
};

// The caller's CONVERSATION, oldest first: what the dock renders and the memory
// the chat agent runs with.
//
// CHAT ROWS ALONE. What the assistant does unasked is the watcher's record
// (`assistant/log` below), not part of anyone's conversation — a line nobody
// said to anybody is not a turn, and feeding it back as one taught the chat
// agent to narrate instead of answer.
export const assistantTurns: CacheEntry = {
  fingerprint: 'assistant/turns',
  intent: "The caller's chat conversation, oldest first",
  shape: [{ turn_id: '', role: '', body: '', at_display: '' }],
  dsl: {
    from: ['assistant_turns'],
    fields: [
      { field: 'assistant_turns.id', as: 'turn_id' },
      'assistant_turns.role',
      'assistant_turns.body',
      'assistant_turns.created_at',
    ],
    filter: { eq: ['assistant_turns.origin', 'chat'] },
    sort: [{ field: 'assistant_turns.created_at', dir: 'asc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        turn_id: { $get: { from: { $var: 'r' }, path: ['turn_id'] } },
        role: { $get: { from: { $var: 'r' }, path: ['role'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        at_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

// What the assistant did UNASKED, newest first. One reader: the administration
// tool, which shows the record beside the conversation. The chat agent never
// sees these rows — the two agents share no history.
export const assistantLog: CacheEntry = {
  fingerprint: 'assistant/log',
  intent: 'What the assistant did on its own for the caller, newest first',
  shape: [{ turn_id: '', body: '', at_display: '' }],
  dsl: {
    from: ['assistant_turns'],
    fields: [{ field: 'assistant_turns.id', as: 'turn_id' }, 'assistant_turns.body', 'assistant_turns.created_at'],
    filter: { eq: ['assistant_turns.origin', 'watch'] },
    sort: [{ field: 'assistant_turns.created_at', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        turn_id: { $get: { from: { $var: 'r' }, path: ['turn_id'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        at_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

// One model run, recorded. Same governed wire as everything else, so the row is
// pinned to whoever the run was for — a record that could be written on another
// principal's behalf would be worth nothing.
export const assistantMeter: MutationEntry = {
  fingerprint: 'assistant/meter',
  intent: 'Record what one assistant run said, called and cost',
  mutation: {
    op: 'insert',
    table: 'assistant_runs',
    values: {
      agent_id: { $context: 'agentId' },
      agent_path: { $context: 'agentPath' },
      label: { $context: 'label' },
      provider: { $context: 'provider' },
      model: { $context: 'model' },
      input_tokens: { $context: 'inputTokens' },
      output_tokens: { $context: 'outputTokens' },
      total_tokens: { $context: 'totalTokens' },
      reported: { $context: 'reported' },
      steps: { $context: 'steps' },
      elapsed_ms: { $context: 'elapsedMs' },
      outcome: { $context: 'outcome' },
      turns: { $context: 'turns' },
      response: { $context: 'response' },
    },
  },
};

// Append one turn. `user_id` and `property_id` are scope-stamped; the caller
// supplies what was said, by which side, and which way in produced it.
export const assistantAppend: MutationEntry = {
  fingerprint: 'assistant/append',
  intent: "Append a turn to the caller's assistant record",
  mutation: {
    op: 'insert',
    table: 'assistant_turns',
    values: {
      role: { $context: 'role' },
      body: { $context: 'body' },
      origin: { $context: 'origin' },
    },
  },
};
