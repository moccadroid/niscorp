import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { TAB_BUTTON, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { cardLayout, cardStripLayout } from './card.layout';

// Your ID card. Everybody who joined has one; it reads your row reactively —
// as the model writes your title and the line about you, the card fills in
// on its own.
//
// Three sizes, all of them this one action: in full in the phone's body; one
// line across the top of the phone (`strip`); a tab (`tab`, shared/tab.layouts).
export const cardAction: ActionDefinition = {
  id: 'member.card',
  description: 'The person\'s ID card: their name, job title and the line about them. Shows; changes nothing.',
  title: 'Your ID card',
  data: {
    me: { member_id: '', name: '', title: '', quirk: '' },
    tab: false,
    strip: false,
    tabLabel: 'Card',
    tabInk: 'paper',
    nextInk: 'paper',
  },
  input: z.toJSONSchema(
    z.object({
      tab: z.boolean().optional().describe('Render as a tab on the phone: a button that opens the card in the phone\'s body.'),
      strip: z.boolean().optional().describe('Render as one line — their name — across the top of the phone.'),
      tabInk: z.enum(['paper', 'ink']).optional().describe('The tab\'s ink: `ink` marks the tab whose action is open in the body.'),
    }),
  ),
  layout: { if: '$.tab', then: TAB_BUTTON, else: { if: '$.strip', then: cardStripLayout, else: cardLayout } },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'member.card', canvas: 'body' } }] },
    TAB_OPENED,
  ],
};
