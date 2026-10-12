import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { arrivalLayout } from './arrival.layout';
import { stayDetailPrism, checkInPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

export const stayCheckinAction: ActionDefinition = {
  id: 'stay.checkin',
  title: 'Check in',
  data: {
    stayId: '',
    propertyId: '',
    capability: '', sheetTitle: '',
    expanded: true,
    stay: {},
    loading: true,
    working: false,
    done: false,
    icon: 'check',
    cta: 'Check in now',
    body: 'We will have your room ready and skip the desk entirely.',
    doneTitle: 'You are checked in',
    doneBody: 'Everything for an in-house stay is on your home screen now.',
  },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Check in',
        blurb: { $if: '$.done', $then: 'You are checked in.', $else: 'Skip the desk — tap and be ready before you arrive.' },
        icon: 'check',
      },
    },
    arrivalLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    confirm: { url: '/api/stay/vex', method: 'POST', request: checkInPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
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

export const stayCheckinInputSchema = z.toJSONSchema(
  z.object({
    capability: z.string().optional().describe('The capability that placed the slot which opened this.'),
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    sheetTitle: z.string().optional(),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full surface.'),
  }),
);
