import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { deckLayout } from './deck.layout';

const toCurrentSlide = [
  { call: 'current', onSuccess: [{ replace: { canvas: 'main', action: '{{$.current.slide_id}}' } }] },
];

export const deckAction: ActionDefinition = {
  id: 'stage.deck',
  title: 'The deck',
  data: { current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' } },
  layout: deckLayout,
  endpoints: {
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
  },
  lifecycle: { mount: toCurrentSlide },
  triggers: [{ message: 'deck-moved', do: toCurrentSlide }],
};
