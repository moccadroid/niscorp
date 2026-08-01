import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { keysLayout } from './keys.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, deskKeyPrism } from './desk.prism';

// Cut a credential from the desk. Placed by the SAME capability that places the
// guest's own key tile — so when Opera v2 goes live, the clerk gains this tool
// in the same instant the guests gain theirs, from one row change.
//
// It is now STAY-SCOPED, and that change deleted more than it added. As a
// house-level tool it had to find a guest, so it carried its own copy of the
// movements list plus a search box — a second list of the same rows, existing
// only because a verb could not be aimed at a row. Declaring `stayId` moved it
// into the workspace beside every other thing the desk can do for the person in
// hand, and took the list, the search and the second read with it.
export const deskKeysAction: ActionDefinition = {
  id: 'desk.keys',
  title: 'Issue a key',
  data: { stayId: '', propertyId: '', stay: {}, credential: '', error: '', loading: true, working: false, expanded: true },
  layout: previewable(
    crewCard('Issue a key', 'key', { $if: '$.stay.key_issued', $then: 'They already hold a key — cut a replacement', $else: 'Cut a mobile credential for this stay.' }),
    keysLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: deskStayPrism, target: 'stay' },
    // The connector cuts it. If that service is down the clerk reads which one
    // did not answer and our database records nothing — a credential is never
    // claimed to exist because a process was up.
    cut: { fn: 'connector.issueKey', target: 'credential', errorTarget: 'error' },
    persist: { url: '/api/stay/vex', method: 'POST', request: deskKeyPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'cut',
      do: [
        { set: 'error', value: '' },
        { set: 'working', value: true },
        {
          call: 'cut',
          onSuccess: [{ call: 'persist', onSuccess: [{ set: 'working', value: false }, { call: 'load' }, { emit: { channel: 'stay-changed' } }] }],
          onError: [{ set: 'working', value: false }, { set: 'error', value: '{{@error.message}}' }],
        },
      ],
    },
    { message: 'stay-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deskKeysInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional().describe('Whose key to cut.'),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full tool.'),
  }),
);
