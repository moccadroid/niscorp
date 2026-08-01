import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { requestLayout } from './request.layout';
import { stayDetailPrism, requestOptionsPrism, raiseRequestPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

// One request action for every request. Spa, housekeeping, report a fault — they
// were three near-identical actions with three hardcoded menus. They are now
// ONE action whose menu is loaded from the integration.
//
// The slot that opens it carries the capability (`spa.book`, `housekeeping.request`,
// `issue.report`); the concierge passes it as `capability`, and this action asks
// the DB what that capability offers at this property. So the same code shows spa
// treatments at Casa Marisol and ticket categories at The Lumen — because those
// options live in Mews and HotelFix respectively, not in this file.
//
// The chosen option carries both the summary (its label) and the issue kind, so
// a spa booking lands on the board as kind 'spa' and an AC report as 'climate',
// with no branching here.
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
  // The generic form's home card wears the SLOT's identity — the seeding
  // passes the resolved row's title and icon through declared input, so one
  // action previews as "Housekeeping" here and "Report a problem" there
  // without this file naming either.
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
    // The room the request is about comes from the stay, not from boot input.
    loadStay: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    // The menu, from whichever connector provides this capability at the property.
    loadOptions: { url: '/api/stay/vex', method: 'POST', request: requestOptionsPrism, target: 'options' },
    send: { url: '/api/service/vex', method: 'POST', request: raiseRequestPrism },
  },
  lifecycle: { mount: [{ call: 'loadStay' }, { call: 'loadOptions', onSuccess: [{ set: 'optionsLoading', value: false }] }] },
  triggers: [
    // Choosing an option carries its label (the summary) and its kind.
    // Tap to choose, tap the chosen one again to unchoose.
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
    // The prepare path: an opener may stage the CHOSEN option (its label as
    // summary, its kind) and the note — the form shows "Asking for: X" with
    // send enabled, and the guest's tap commits. Stage them verbatim from the
    // menu the property actually offers.
    summary: z.string().optional().describe('Stage the chosen option — its exact label from the property’s menu.'),
    kind: z.string().optional().describe('The chosen option’s kind, verbatim from the same menu row.'),
    detail: z.string().optional().describe('Prefill the free-text note in the guest’s own words. The guest still chooses the option and presses send.'),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full form.'),
    cardTitle: z.string().optional().describe('The resolved slot title the home card wears (Housekeeping, Report a problem).'),
    cardIcon: z.string().optional().describe('The resolved slot icon for the home card.'),
  }),
);
