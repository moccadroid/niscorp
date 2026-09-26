import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent, slidesCount } from '@lyceum/app/vex/deck.entries';
import { stripLayout } from './strip.layout';

// The projector's strip, over every slide: where the talk is, and the room.
// Its own canvas, so it never remounts when a slide does; every read is
// reactive, so it follows the deck and the room on its own.
export const stripAction: ActionDefinition = {
  id: 'stage.strip',
  title: 'The strip',
  data: {
    current: { slide_id: '', title: '', position: 0, number: 0, tool_id: '' },
    count: { slides: 0 },
    counts: { joined: 0, assigned: 0, unassigned: 0 },
  },
  layout: stripLayout,
  endpoints: {
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    slides: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesCount.fingerprint, context: {} }, target: 'count' },
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
  },
  lifecycle: { mount: [{ call: 'current' }, { call: 'slides' }, { call: 'counts' }] },
  triggers: [],
};
