import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { stripLayout } from './strip.layout';

// The projector's strip, over every slide: where the talk is, the address to
// step in at (for whoever arrives after the first slide), and the room.
// Its own canvas, so it never remounts when a slide does; every read is
// reactive, so it follows the deck and the room on its own.
export const stripAction: ActionDefinition = {
  id: 'stage.strip',
  title: 'The strip',
  data: {
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    counts: { joined: 0 },
    address: { url: '', host: '' },
  },
  layout: stripLayout,
  endpoints: {
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    address: { fn: 'room.address', target: 'address' },
  },
  lifecycle: { mount: [{ call: 'current' }, { call: 'counts' }, { call: 'address' }] },
  triggers: [],
};
