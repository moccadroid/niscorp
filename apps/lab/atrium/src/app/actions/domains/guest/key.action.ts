import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { keyLayout } from './key.layout';
import { stayDetailPrism, issueKeyPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

export const stayKeyAction: ActionDefinition = {
  id: 'stay.key',
  title: 'Room key',
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, stay: {}, credential: '', error: '', working: false, loading: true },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Room key',
        blurb: { $if: '$.credential', $then: 'Key {{$.credential}} is on this phone.', $else: 'Your door opens from this phone — tap to cut the key.' },
        icon: 'key',
      },
    },
    keyLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    cut: { fn: 'connector.issueKey', target: 'credential', errorTarget: 'error' },
    persist: { url: '/api/stay/vex', method: 'POST', request: issueKeyPrism },
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
    ...previewTriggers,
  ],
};

export const stayKeyInputSchema = z.toJSONSchema(
  z.object({
    capability: z.string().optional().describe('The capability that placed the slot which opened this.'),
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    sheetTitle: z.string().optional(),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full surface.'),
  }),
);
