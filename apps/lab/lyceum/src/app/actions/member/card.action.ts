import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { TAB_BUTTON } from '@lyceum/app/actions/shared/tab.layouts';
import { cardLayout, cardStripLayout } from './card.layout';

// Your ID card. Everybody in the room has one, assigned or not; it reads the
// same row the identity seam does, reactively — when you are assigned, or you
// change your name, the card changes on its own.
//
// Three sizes, all of them this one action: in full in the phone's body; one
// line across the top of the phone (`strip`); a tab (`tab`, shared/tab.layouts).
export const cardAction: ActionDefinition = {
  id: 'member.card',
  title: 'Your ID card',
  data: {
    me: { member_id: '', name: '', title: '', quirk: '', department_id: '', department_name: '', department_remit: '', department_mark: '', department_sigil: '' },
    tab: false,
    strip: false,
    tabLabel: 'Card',
  },
  input: z.toJSONSchema(
    z.object({
      tab: z.boolean().optional().describe('Render as a tab on the phone: a button that opens the card in the phone\'s body.'),
      strip: z.boolean().optional().describe('Render as one line — name and department — across the top of the phone.'),
    }),
  ),
  layout: { if: '$.tab', then: TAB_BUTTON, else: { if: '$.strip', then: cardStripLayout, else: cardLayout } },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ resetTo: { action: 'member.card', canvas: 'body' } }] }],
};
