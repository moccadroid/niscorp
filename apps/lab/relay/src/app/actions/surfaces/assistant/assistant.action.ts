import type { ActionDefinition } from '@niscorp/nova';
import { assistantLayout } from './assistant.layout';

// The Ray chat surface. Sessions persist server-side per principal (via the
// ray.* fns — moss's in-process function seam), so closing and reopening keeps
// the history; a session picker + New button switch or start a conversation.
// Sending appends to `$.messages`, then calls `ray.run` (the Cortex agent,
// running INSIDE moss), which drives this session's shell, persists the
// exchange, and returns the reply. Keys are server .env — no key UI exists.
const SEND = [
  { set: 'status', value: 'thinking' },
  { push: 'messages', value: { role: 'user', text: '$.draft' } },
  { set: 'draft', value: '' },
  {
    call: 'ask',
    onSuccess: [
      { push: 'messages', value: { role: 'ray', text: '$.reply.text', trace: '$.reply.trace', ms: '$.reply.ms', view: '$.reply.view' } },
      { set: 'status', value: 'idle' },
    ],
    onError: [
      { push: 'messages', value: { role: 'ray', text: '⚠️ {{@error.message}}' } },
      { set: 'status', value: 'idle' },
    ],
  },
];

// Seed the chat from whatever the loaded/new/switched session returns.
const fromSession = [
  { set: 'messages', value: '$.session.messages' },
  { set: 'sessions', value: '$.session.sessions' },
  { set: 'currentId', value: '$.session.currentId' },
  { set: 'debug', value: '$.session.debug' },
];

export const assistantAction: ActionDefinition = {
  id: 'assistant',
  data: { messages: [], draft: '', status: 'idle', reply: '', sessions: [], currentId: '', session: {}, debug: false },
  layout: assistantLayout,
  endpoints: {
    ask: { fn: 'ray.run', target: 'reply' },
    load: { fn: 'ray.load', target: 'session' },
    newSession: { fn: 'ray.newSession', target: 'session' },
    switchSession: { fn: 'ray.switch', target: 'session' },
  },
  // On open, restore the current session (history survives a close).
  lifecycle: { mount: [{ call: 'load', onSuccess: fromSession }] },
  triggers: [
    { event: 'ui:model', ref: 'ray-draft', do: [{ set: 'draft', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'ray-close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'ray-new-session', do: [{ call: 'newSession', onSuccess: fromSession }] },
    { event: 'ui:model', ref: 'ray-session-select', do: [{ set: 'currentId', value: '@event.payload' }, { call: 'switchSession', onSuccess: fromSession }] },
    { event: 'ui:click', ref: 'ray-send', do: SEND },
    { event: 'ui:key', ref: 'ray-draft', key: 'Enter', do: SEND },
  ],
};
