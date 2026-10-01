import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { timerNext } from '@lyceum/app/vex/timer.entries';
import { headLayout } from './head.layout';

// The top of the controller: the room, the slide on screen, and the time left
// on the newest timer. All three reads are reactive — the head follows the
// deck, the room and the timers, whoever moved them. It is always on the
// controller, so it is what hears a saved automation's `notify` (published
// into the speaker's live shell, server/timing.ts) and opens the notification
// over the screen.
export const headAction: ActionDefinition = {
  id: 'speaker.head',
  title: 'Where the talk is',
  data: {
    counts: { joined: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    timer: { timer_id: '', intent: '', due_at: '' },
  },
  layout: headLayout,
  endpoints: {
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    timer: { url: '/api/vex', method: 'POST', request: { fingerprint: timerNext.fingerprint, context: {} }, target: 'timer' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }, { call: 'timer' }] },
  triggers: [
    // The menu's Reset asks first: it opens over the controller (speaker/reset.action.ts).
    { event: 'ui:click', ref: 'reset', do: [{ push: { action: 'speaker.reset', canvas: 'overlay', with: ['sheet'] } }] },
    {
      message: 'notify',
      do: [{ push: { action: 'speaker.notification', canvas: 'overlay', with: ['sheet'], input: { text: '@event.payload.text', sheetTitle: 'Notification' } } }],
    },
  ],
};
