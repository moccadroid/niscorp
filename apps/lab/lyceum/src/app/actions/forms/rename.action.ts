import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { TAB_BUTTON, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { renameLayout } from './rename.layout';
import { renamePrism } from './rename.prism';

// FORMS' clearance: change your own record. The write is `members/rename`,
// served at the personal reach — the engine pins it to your own row. Your
// name changes on your ID card, on the register, on the projector: every
// screen that reads it, without anybody telling them.
export const renameAction: ActionDefinition = {
  id: 'forms.rename',
  title: 'Change your record',
  data: { tab: false, tabLabel: 'Rename', tabInk: 'paper', nextInk: 'paper', me: { member_id: '', name: '' }, draft: '', saved: false, error: '' },
  input: z.toJSONSchema(
    z.object({
      tab: z.boolean().optional().describe("Render as a tab on the phone: a button that opens it in the phone's body."),
      tabInk: z.enum(['paper', 'ink']).optional().describe("The tab's ink: `ink` marks the tab whose action is open in the body."),
      draft: z.string().optional().describe('A new name, put in the field ready to file.'),
    }),
  ),
  layout: { if: '$.tab', then: TAB_BUTTON, else: renameLayout },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
    save: { url: '/api/vex', method: 'POST', request: renamePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'forms.rename', canvas: 'body' } }] },
    TAB_OPENED,
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'error', value: '' },
        { call: 'save', onSuccess: [{ set: 'draft', value: '' }, { set: 'saved', value: true }] },
      ],
    },
  ],
};
