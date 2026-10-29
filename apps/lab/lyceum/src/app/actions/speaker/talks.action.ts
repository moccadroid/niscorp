import type { ActionDefinition } from '@niscorp/nova';
import { deckTalk, talksAll } from '@lyceum/app/vex/deck.entries';
import { talksLayout } from './talks.layout';

// EVERY TALK, over the controller: the talks this room can give as a list, the
// one that is on marked. Press one and its first slide goes up, and the sheet
// closes. Opened from the head's menu onto the `overlay` canvas with the
// `sheet` fragment; it has no idea it is a popup.
//
// SWITCHING TALKS IS A RESET (server/functions/reset.functions.ts): the other
// talk starts with an empty room. With nothing to lose, the press just
// switches. With something, the server refuses the press and says what would
// go; the sheet then asks, and Yes sends the same press again, sure this time.
const pick = [{ set: 'asked', value: { message: '' } }, { call: 'pick', onSuccess: [{ pop: true as const }] }];

export const talksAction: ActionDefinition = {
  id: 'speaker.talks',
  title: 'All talks',
  data: { sheetTitle: 'All talks', talks: [], talk: { talk_id: '', title: '' }, picked: '', sure: false, asked: { message: '' } },
  layout: talksLayout,
  endpoints: {
    all: { url: '/api/vex', method: 'POST', request: { fingerprint: talksAll.fingerprint, context: {} }, target: 'talks' },
    talk: { url: '/api/vex', method: 'POST', request: { fingerprint: deckTalk.fingerprint, context: {} }, target: 'talk' },
    pick: { fn: 'talk.switch', errorTarget: 'asked' },
  },
  lifecycle: { mount: [{ call: 'all' }, { call: 'talk' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'picked', value: '@event.payload' }, { set: 'sure', value: false }, ...pick] },
    { event: 'ui:click', ref: 'yes', do: [{ set: 'sure', value: true }, ...pick] },
    { event: 'ui:click', ref: 'no', do: [{ pop: true }] },
  ],
};
