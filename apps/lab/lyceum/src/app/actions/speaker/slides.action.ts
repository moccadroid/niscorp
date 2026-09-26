import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent, slidesAll, slidesCount } from '@lyceum/app/vex/deck.entries';
import { deckPickPrism } from './console.prism';

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
    current: { slide_id: '', title: '', position: 0, number: 0, tool_id: '' },
    count: { slides: 0 },
    picked: 0,
    error: '',
  },
  layout: {
    component: 'Rows',
    props: {
      rows: '$.slides',
      rowKey: 'position',
      rowRef: 'pick',
      selected: '$.current.position',
      columns: [
        { label: '#', key: 'number', kind: 'mono', w: 0.4 },
        { label: 'Slide', key: 'title', w: 5 },
      ],
    },
  },
  endpoints: {
    all: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesAll.fingerprint, context: {} }, target: 'slides' },
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    count: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesCount.fingerprint, context: {} }, target: 'count' },
    pick: { url: '/api/vex', method: 'POST', request: deckPickPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'all' }, { call: 'current' }, { call: 'count' }] },
  triggers: [{ event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }, { call: 'pick', onSuccess: [{ pop: true }] }] }],
};
