import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent, slidesAll } from '@lyceum/app/vex/deck.entries';
import { deckPickPrism } from './console.prism';
import { slidesLayout } from './slides.layout';

// EVERY SLIDE, over the controller: the deck as a numbered list, the slide on
// screen marked. Press one and it goes up, and the sheet closes. Opened from
// the controller onto the `overlay` canvas with the `sheet` fragment — it has
// no idea it is a popup.
export const slidesAction: ActionDefinition = {
  id: 'speaker.slides',
  title: 'All slides',
  data: {
    sheetTitle: 'All slides',
    slides: [],
    current: { slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' },
    picked: 0,
    error: '',
  },
  layout: slidesLayout,
  endpoints: {
    all: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesAll.fingerprint, context: {} }, target: 'slides' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    pick: { url: '/api/vex', method: 'POST', request: deckPickPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'all' }, { call: 'current' }] },
  triggers: [{ event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }, { call: 'pick', onSuccess: [{ pop: true }] }] }],
};
