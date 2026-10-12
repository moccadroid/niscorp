import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { keysLayout } from './keys.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { deskStayPrism, deskKeyPrism } from './desk.prism';

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
