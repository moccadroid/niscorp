import type { CacheEntry, MutationEntry } from './index';
import { stampText } from '@atrium/app/prisms/format.prism';

// No context here carries a user id: the scope behavior pins `assistant_turns`
// rows to the caller, on read and on write.

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
