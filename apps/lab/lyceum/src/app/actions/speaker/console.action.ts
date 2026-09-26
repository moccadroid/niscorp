import type { ActionDefinition } from '@niscorp/nova';
import { memberCounts } from '@lyceum/app/vex/member.entries';
import { deckCurrent, slidesCount } from '@lyceum/app/vex/deck.entries';
import { consoleLayout } from './console.layout';
import { deckBackPrism, deckNextPrism } from './console.prism';

// The speaker's controller — the one screen that holds the talk's levers. The
// counts are a reactive read: they follow the room without being told.
// Sorting is a server function: it runs as the `hat`, one person at a time,
// and each placement re-roles that person's live shell.
export const consoleAction: ActionDefinition = {
  id: 'speaker.console',
  title: 'Controller',
  data: {
    counts: { joined: 0, sorted: 0, unsorted: 0 },
    current: { slide_id: '', title: '', position: 0, number: 0 },
    count: { slides: 0 },
    sorting: false,
    error: '',
  },
  layout: consoleLayout,
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberCounts.fingerprint, context: {} }, target: 'counts' },
    // The deck: reactive reads, so the controller follows it whoever moved it.
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
    slides: { url: '/api/vex', method: 'POST', request: { fingerprint: slidesCount.fingerprint, context: {} }, target: 'count' },
    next: { url: '/api/vex', method: 'POST', request: deckNextPrism, errorTarget: 'error' },
    back: { url: '/api/vex', method: 'POST', request: deckBackPrism, errorTarget: 'error' },
    sort: { fn: 'speaker.sort', errorTarget: 'error' },
    unsort: { fn: 'speaker.unsort', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load' }, { call: 'current' }, { call: 'slides' }] },
  triggers: [
    { event: 'ui:click', ref: 'next', do: [{ call: 'next' }] },
    {
      event: 'ui:click',
      ref: 'unsort',
      do: [
        { set: 'sorting', value: true },
        { set: 'error', value: '' },
        { call: 'unsort', onSuccess: [{ set: 'sorting', value: false }], onError: [{ set: 'sorting', value: false }] },
      ],
    },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    {
      event: 'ui:click',
      ref: 'sort',
      do: [
        { set: 'sorting', value: true },
        { set: 'error', value: '' },
        {
          call: 'sort',
          onSuccess: [{ set: 'sorting', value: false }],
          onError: [{ set: 'sorting', value: false }],
        },
      ],
    },
  ],
};
