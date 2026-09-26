import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent, slidesAll, slidesCount } from '@lyceum/app/vex/deck.entries';
import { consoleLayout } from './console.layout';
import { deckBackPrism, deckNextPrism, deckPickPrism } from './console.prism';

// The speaker's controller: where the talk is, back and next, and every slide
// in the deck to jump to. What a slide needs besides — assigning the room on
// the assignment slides — is not here: it is the slide's own tool, on the
// `tools` canvas, there only while that slide is up (speaker/deck.action.ts).
export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: {
    counts: { joined: 0, assigned: 0, unassigned: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0, tool_id: '' },
    count: { slides: 0 },
    slides: [],
    picked: 0,
    error: '',
  },
  layout: consoleLayout,
  endpoints: {
    // Reactive reads: the controller follows the deck and the room, whoever
    // moved them.
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    slides: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesCount.fingerprint, context: {} }, target: 'count' },
    all: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesAll.fingerprint, context: {} }, target: 'slides' },
    next: { url: '/api/vex', method: 'POST', request: deckNextPrism, errorTarget: 'error' },
    back: { url: '/api/vex', method: 'POST', request: deckBackPrism, errorTarget: 'error' },
    pick: { url: '/api/vex', method: 'POST', request: deckPickPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }, { call: 'slides' }, { call: 'all' }] },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ call: 'next' }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }, { call: 'pick' }] },
  ],
};
