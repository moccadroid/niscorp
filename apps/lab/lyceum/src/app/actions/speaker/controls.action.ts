import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { deckBackPrism, deckNextPrism } from './console.prism';

// The bottom of the controller: every slide one press away, and Back and Next,
// each saying which slide it goes to. "All slides" opens over the controller
// (speaker/slides.action.ts), so a deck of fifty moves nothing.
export const controlsAction: ActionDefinition = {
  id: 'speaker.controls',
  title: 'Back and next',
  data: {
    current: { slide_id: '', title: '', position: 0, number: 0, tool_id: 'tools.none', count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    error: '',
  },
  layout: {
    component: 'Sheet',
    props: { areas: ['all all', 'back next'] },
    children: [
      { component: 'Action', ref: 'all', props: { area: 'all', label: 'All slides ({{$.current.count}})' } },
      {
        component: 'Action',
        ref: 'back',
        props: { area: 'back', lines: 'two', label: { $if: '$.current.prev_title', $then: '← {{$.current.prev_number}} · {{$.current.prev_title}}', $else: 'Start of the deck' } },
      },
      {
        component: 'Action',
        ref: 'next',
        props: { area: 'next', ink: 'alert', lines: 'two', label: { $if: '$.current.next_title', $then: '{{$.current.next_number}} · {{$.current.next_title}} →', $else: 'End of the deck' } },
      },
    ],
  },
  endpoints: {
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    next: { url: '/api/vex', method: 'POST', request: deckNextPrism, errorTarget: 'error' },
    back: { url: '/api/vex', method: 'POST', request: deckBackPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'current' }] },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ call: 'next' }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'all', do: [{ push: { action: 'speaker.slides', canvas: 'overlay', with: ['sheet'] } }] },
  ],
};
