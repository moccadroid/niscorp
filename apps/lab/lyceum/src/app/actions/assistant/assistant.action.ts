import type { ActionDefinition } from '@niscorp/nova';
import { turnResolve, turnsMine } from '@lyceum/app/vex/assistant.entries';
import { assistantLayout } from './assistant.layout';

const run = [
  { set: 'error', value: '' },
  { set: 'answered', value: false },
  { set: 'thinking', value: true },
  {
    call: 'turn',
    onSuccess: [
      { set: 'answered', value: true },
      { set: 'thinking', value: false },
      { set: 'draft', value: '' },
      { reconcile: { to: '$.reply.opened', action: 'action', input: 'input', canvas: 'overlay', with: ['sheet'] } },
    ],
    onError: [{ set: 'thinking', value: false }],
  },
];

export const assistantAction: ActionDefinition = {
  id: 'assistant.thread',
  description: 'The conversation with the assistant.',
  title: 'Your assistant',
  data: {
    draft: '',
    intro: { title: 'Assistant', builtFrom: '', tools: '' },
    reply: { turnId: '', text: '', proposals: [], opened: [] },
    history: [],
    thinking: false,
    answered: false,
    chosen: { timerId: '', draft: {}, json: '', intent: '', when: '', reasoning: '' },
    savedTimer: { dueLocal: '' },
    error: '',
  },
  layout: assistantLayout,
  endpoints: {
    intro: { fn: 'assistant.intro', target: 'intro' },
    // A turn is model calls end to end, and a full room shares one provider's
    // rate limit: it may take longer than the shell's 30s.
    turn: { fn: 'assistant.turn', target: 'reply', errorTarget: 'error', timeoutMs: 120_000 },
    save: { fn: 'timers.save', target: 'savedTimer', errorTarget: 'error' },
    history: { url: '/api/vex', method: 'POST', request: { fingerprint: turnsMine.fingerprint, context: {} }, target: 'history' },
    resolve: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: turnResolve.fingerprint,
        context: {
          turnId: { $ref: '$.reply.turnId' },
          outcome: { $interpolate: { template: 'Saved · runs at {{at}}, with no model.', values: { at: { $ref: '$.savedTimer.dueLocal' } } } },
        },
      },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'intro' }, { call: 'history' }] },
  triggers: [
    { event: 'ui:click', ref: 'send', do: run },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: run },
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'error', value: '' },
        { set: 'chosen', value: '@event.payload' },
        { call: 'save', onSuccess: [{ call: 'resolve', onSuccess: [{ set: 'answered', value: false }] }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'reopen',
      do: [
        {
          push: {
            action: '@event.payload.action',
            canvas: 'overlay',
            with: ['sheet'],
            input: {
              about: '@event.payload.input.about',
              draft: '@event.payload.input.draft',
              intent: '@event.payload.input.intent',
              shape: '@event.payload.input.shape',
              routed: '@event.payload.input.routed',
              sheetTitle: '@event.payload.input.sheetTitle',
            },
          },
        },
      ],
    },
  ],
};
