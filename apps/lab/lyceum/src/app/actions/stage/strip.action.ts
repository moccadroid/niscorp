import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { stripLayout } from './strip.layout';

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
