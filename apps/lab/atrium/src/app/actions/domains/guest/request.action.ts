import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { requestLayout } from './request.layout';
import { stayDetailPrism, requestOptionsPrism, raiseRequestPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

export const stayRequestAction: ActionDefinition = {
  id: 'stay.request',
  title: 'Request',
  data: {
    stayId: '',
    propertyId: '',
    capability: '',
    sheetTitle: '',
    expanded: true,
    cardTitle: '',
    cardIcon: 'sparkle',
    stay: {},
    options: [],
    optionsLoading: true,
    summary: '',
    kind: 'other',
    detail: '',
    working: false,
    done: false,
  },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: '{{$.cardTitle}}',
        blurb: { $if: '$.done', $then: 'The desk has it.', $else: { $if: '$.summary', $then: 'Asking for: {{$.summary}} — tap to send', $else: '{{$.options.length}} options from the house' } },
        icon: '$.cardIcon',
      },
    },
    requestLayout,
  ),
  endpoints: {
    loadStay: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    loadOptions: { url: '/api/stay/vex', method: 'POST', request: requestOptionsPrism, target: 'options' },
    send: { url: '/api/service/vex', method: 'POST', request: raiseRequestPrism },
  },
  lifecycle: { mount: [{ call: 'loadStay' }, { call: 'loadOptions', onSuccess: [{ set: 'optionsLoading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'choose',
      do: [
        { set: 'kind', value: { $if: { $eq: ['@event.payload.label', '$.summary'] }, $then: '', $else: '@event.payload.kind' } },
        { set: 'summary', value: { $if: { $eq: ['@event.payload.label', '$.summary'] }, $then: '', $else: '@event.payload.label' } },
      ],
    },
    { event: 'ui:model', ref: 'detail', do: [{ set: 'detail', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'working', value: true },
        { call: 'send', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'issues-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

export const stayRequestInputSchema = z.toJSONSchema(
  z.object({
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    capability: z.string().optional().describe('The capability whose options to show — the slot that opened this carries it.'),
    sheetTitle: z.string().optional(),
    summary: z.string().optional().describe('Stage the chosen option — its exact label from the property’s menu.'),
    kind: z.string().optional().describe('The chosen option’s kind, verbatim from the same menu row.'),
    detail: z.string().optional().describe('Prefill the free-text note in the guest’s own words. The guest still chooses the option and presses send.'),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full form.'),
    cardTitle: z.string().optional().describe('The resolved slot title the home card wears (Housekeeping, Report a problem).'),
    cardIcon: z.string().optional().describe('The resolved slot icon for the home card.'),
  }),
);
