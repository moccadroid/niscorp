import type { ActionDefinition } from '@niscorp/nova';
import { assistantLayout } from './assistant.layout';

const SEND = [
  { set: 'status', value: 'thinking' },
  { set: 'live', value: [] },
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

const fromSession = [
  { set: 'messages', value: '$.session.messages' },
  { set: 'sessions', value: '$.session.sessions' },
  { set: 'currentId', value: '$.session.currentId' },
  { set: 'debug', value: '$.session.debug' },
];

export const assistantAction: ActionDefinition = {
  id: 'assistant',
  data: { messages: [], draft: '', status: 'idle', reply: '', sessions: [], currentId: '', session: {}, debug: false, live: [] },
  layout: assistantLayout,
  endpoints: {
    ask: { fn: 'ray.run', target: 'reply' },
    load: { fn: 'ray.load', target: 'session' },
    newSession: { fn: 'ray.newSession', target: 'session' },
    switchSession: { fn: 'ray.switch', target: 'session' },
    stop: { fn: 'ray.stop' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: fromSession }] },
  triggers: [
    { event: 'ui:model', ref: 'ray-draft', do: [{ set: 'draft', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'ray-close', do: [{ pop: true }] },
    // `stop` only aborts: the running `ask` still returns, and its reply path
    // sets `status` back to idle.
    { event: 'ui:click', ref: 'ray-stop', do: [{ call: 'stop' }] },
    { event: 'ui:click', ref: 'ray-new-session', do: [{ call: 'newSession', onSuccess: fromSession }] },
    { event: 'ui:model', ref: 'ray-session-select', do: [{ set: 'currentId', value: '@event.payload' }, { call: 'switchSession', onSuccess: fromSession }] },
    { event: 'ui:click', ref: 'ray-send', do: SEND },
    { event: 'ui:key', ref: 'ray-draft', key: 'Enter', do: SEND },
    { message: 'ray:step', do: [{ set: 'live', value: '@event.payload' }] },
  ],
};
