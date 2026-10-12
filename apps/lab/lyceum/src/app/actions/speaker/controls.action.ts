import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { deckBackPrism, deckNextPrism } from './console.prism';
import { controlsLayout } from './controls.layout';

export const controlsAction: ActionDefinition = {
  id: 'speaker.controls',
  title: 'Back and next',
  data: {
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    error: '',
  },
  layout: controlsLayout,
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
