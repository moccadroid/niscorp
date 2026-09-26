import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';

// The top of the controller: the room, and the slide on screen. Both reads are
// reactive — the head follows the deck and the room, whoever moved them.
export const headAction: ActionDefinition = {
  id: 'speaker.head',
  title: 'Where the talk is',
  data: {
    counts: { joined: 0, assigned: 0, unassigned: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
  },
  layout: {
    component: 'Sheet',
    props: { areas: ['room', 'slide'] },
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
    ],
  },
  endpoints: {
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }] },
  triggers: [],
};
