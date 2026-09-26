import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';
import { deckLayout } from './deck.layout';

// THE PROJECTOR'S DECK. It shows nothing itself: it keeps the stage's `main`
// canvas on the slide the `deck` row names. On mount — so a restarted server
// lands on the same slide — and whenever the deck moves (`deck-moved`, sent by
// the write's reaction), it reads the row and replaces `main` with that slide's
// action.
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
