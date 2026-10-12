import type { ActionDefinition } from '@niscorp/nova';
import { assistantLayout } from './assistant.layout';

export const assistantAction: ActionDefinition = {
  id: 'assistant',
  title: 'Assistant',
  data: { open: false, turns: [], draft: '', sent: '', pending: '', thinking: false, seconds: 0, profile: {} },
  layout: assistantLayout,
  endpoints: {
    load: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'assistant/turns', context: {} },
      target: 'turns',
    },
    send: { fn: 'assistant.send' },
    nudge: { fn: 'assistant.nudge' },
    profile: { fn: 'assistant.profile', target: 'profile' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'profile' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: true }] },
    // The run is server side and sets `thinking` itself a beat later; a button
    // that looks dead for that beat gets pressed twice.
    { event: 'ui:click', ref: 'nudge', do: [{ set: 'thinking', value: true }, { call: 'nudge' }] },
    { event: 'ui:click', ref: 'close', do: [{ set: 'open', value: false }] },
    { event: 'ui:model', ref: 'draft', do: [{ set: 'draft', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        // The fn reads `sent`; `pending` shows the line optimistically.
        { set: 'sent', from: 'draft' },
        { set: 'pending', from: 'draft' },
        { set: 'draft', value: '' },
        { set: 'thinking', value: true },
        {
          call: 'send',
          onSuccess: [{ set: 'thinking', value: false }, { set: 'pending', value: '' }, { call: 'load' }],
          onError: [{ set: 'thinking', value: false }, { set: 'pending', value: '' }, { call: 'load' }],
        },
      ],
    },
    { message: 'settings-changed', do: [{ call: 'profile' }] },
  ],
};
