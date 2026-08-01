import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { arrivalLayout } from './arrival.layout';
import { stayDetailPrism, checkOutPrism, folioTotalPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

// Express checkout — the second thing Opera v2 unlocks. Same layout as check-in,
// different words and a different write, because they are the same shape.
//
// The done screen shows the real settled folio total (loaded from the DB), not a
// promise of an email that never sends.
export const stayCheckoutAction: ActionDefinition = {
  id: 'stay.checkout',
  title: 'Express checkout',
  data: {
    stayId: '',
    propertyId: '',
    capability: '', sheetTitle: '',
    expanded: true,
    stay: {},
    total: {},
    loading: true,
    working: false,
    done: false,
    icon: 'door',
    cta: 'Settle and check out',
    body: 'Whatever the hour. Your folio is charged to the card on file and the key is retired.',
    doneTitle: 'Checked out',
    doneBody: 'Safe travels. Your folio is settled in full.',
  },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Express checkout',
        blurb: { $if: '$.done', $then: 'Checked out — safe travels.', $else: '{{$.total.total_display}} on the room — settle and go, whatever the hour.' },
        icon: 'door',
      },
    },
    arrivalLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    loadTotal: { url: '/api/stay/vex', method: 'POST', request: folioTotalPrism, target: 'total' },
    confirm: { url: '/api/stay/vex', method: 'POST', request: checkOutPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadTotal' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        { set: 'working', value: true },
        { call: 'confirm', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'stay-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

export const stayCheckoutInputSchema = z.toJSONSchema(
  z.object({
    capability: z.string().optional().describe('The capability that placed the slot which opened this.'),
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    sheetTitle: z.string().optional(),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full surface.'),
  }),
);
