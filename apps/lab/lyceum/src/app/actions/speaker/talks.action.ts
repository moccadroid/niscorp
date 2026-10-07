import type { ActionDefinition } from '@niscorp/nova';
import { deckGo, deckTalk, talksAll, TALK_DECK } from '@lyceum/app/vex/deck.entries';
import { talksLayout } from './talks.layout';

// EVERY TALK, over the controller: the talks this room can give as a list, the
// one that is on marked. Press one and its first slide goes up — the same
// write as Next and Back, to position 0 of that talk — and the sheet closes.
// Opened from the head's menu onto the `overlay` canvas with the `sheet`
// fragment; it has no idea it is a popup.
export const talksAction: ActionDefinition = {
  id: 'speaker.talks',
  title: 'All talks',
  data: { sheetTitle: 'All talks', talks: [], talk: { talk_id: '', title: '' }, picked: '', error: '' },
  layout: talksLayout,
  endpoints: {
    all: { url: '/api/vex', method: 'POST', request: { fingerprint: talksAll.fingerprint, context: {} }, target: 'talks' },
    talk: { url: '/api/vex', method: 'POST', request: { fingerprint: deckTalk.fingerprint, context: {} }, target: 'talk' },
    pick: { url: '/api/vex', method: 'POST', request: { fingerprint: deckGo.fingerprint, context: { deck: TALK_DECK, talk: { $ref: '$.picked' }, position: 0 } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'all' }, { call: 'talk' }] },
  triggers: [{ event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }, { call: 'pick', onSuccess: [{ pop: true }] }] }],
};
