import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent, slidesCount } from '@lyceum/app/vex/deck.entries';
import { consoleLayout } from './console.layout';
import { deckBackPrism, deckNextPrism } from './console.prism';

// The speaker's controller: where the talk is, and back and next. Every slide
// in the deck is one press away — "All slides" opens them over the controller
// (speaker/slides.action.ts), so a deck of fifty never pushes anything around. What a slide needs besides — assigning the room on
// the assignment slides — is not here: it is the slide's own tool, on the
// `tools` canvas, there only while that slide is up (speaker/deck.action.ts).
export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: {
    counts: { joined: 0, assigned: 0, unassigned: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0, tool_id: '' },
    count: { slides: 0 },
    error: '',
  },
  layout: consoleLayout,
  endpoints: {
    // Reactive reads: the controller follows the deck and the room, whoever
    // moved them.
    counts: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    slides: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesCount.fingerprint, context: {} }, target: 'count' },
    next: { url: '/api/vex', method: 'POST', request: deckNextPrism, errorTarget: 'error' },
    back: { url: '/api/vex', method: 'POST', request: deckBackPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'counts' }, { call: 'current' }, { call: 'slides' }] },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ call: 'next' }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'all', do: [{ push: { action: 'speaker.slides', canvas: 'overlay', with: ['sheet'] } }] },
  ],
};
