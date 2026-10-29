import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent, deckTalk } from '@lyceum/app/vex/deck.entries';
import { timerNext } from '@lyceum/app/vex/timer.entries';
import { headLayout } from './head.layout';

export const headAction: ActionDefinition = {
  id: 'speaker.head',
  title: 'Where the talk is',
  data: {
    counts: { joined: 0 },
    current: { slide_id: '', talk_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    talk: { talk_id: '', title: '' },
    timer: { timer_id: '', intent: '', due_at: '' },
  },
  layout: headLayout,
  endpoints: {
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    talk: { url: '/api/vex', method: 'POST', request: { fingerprint: deckTalk.fingerprint, context: {} }, target: 'talk' },
    timer: { url: '/api/vex', method: 'POST', request: { fingerprint: timerNext.fingerprint, context: {} }, target: 'timer' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }, { call: 'talk' }, { call: 'timer' }] },
  triggers: [
    { event: 'ui:click', ref: 'talks', do: [{ push: { action: 'speaker.talks', canvas: 'overlay', with: ['sheet'] } }] },
    { event: 'ui:click', ref: 'reset', do: [{ push: { action: 'speaker.reset', canvas: 'overlay', with: ['sheet'] } }] },
    {
      message: 'notify',
      do: [{ push: { action: 'speaker.notification', canvas: 'overlay', with: ['sheet'], input: { text: '@event.payload.text', sheetTitle: 'Notification' } } }],
    },
  ],
};
