import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { timerNext } from '@lyceum/app/vex/timer.entries';

// The top of the controller: the room, the slide on screen, and the time left
// on the newest timer. All three reads are reactive — the head follows the
// deck, the room and the timers, whoever moved them.
export const headAction: ActionDefinition = {
  id: 'speaker.head',
  title: 'Where the talk is',
  data: {
    counts: { joined: 0, assigned: 0, unassigned: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    timer: { timer_id: '', intent: '', due_at: '' },
  },
  layout: {
    component: 'Sheet',
    props: { areas: ['room room', 'slide timer'], cols: [3, 1] },
    children: [
      { component: 'Cell', props: { area: 'room' }, children: [{ component: 'Label', children: 'Controller · {{$.counts.joined}} in the room · {{$.counts.assigned}} assigned' }] },
      {
        component: 'Cell',
        props: { area: 'slide' },
        children: [
          { component: 'Label', children: 'On screen · slide {{$.current.number}} of {{$.current.count}}' },
          { component: 'Headline', props: { level: 'name' }, children: '{{$.current.title}}' },
        ],
      },
      {
        if: '$.timer.due_at',
        then: { component: 'Cell', props: { area: 'timer', ink: 'live' }, children: [{ component: 'Countdown', props: { label: 'Timer', to: '$.timer.due_at' } }] },
        else: { component: 'Cell', props: { area: 'timer', mark: 'hatch' }, children: [{ component: 'Label', children: 'No timer' }] },
      },
    ],
  },
  endpoints: {
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    timer: { url: '/api/vex', method: 'POST', request: { fingerprint: timerNext.fingerprint, context: {} }, target: 'timer' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }, { call: 'timer' }] },
  triggers: [],
};
