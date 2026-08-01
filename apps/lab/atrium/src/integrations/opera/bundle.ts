import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { IntegrationBundle } from '../types';
import { wakeSet, wakeForStay, wakeCancel, wakeSheet, wakeSetDone, requestRaise, requestsPending, requestDecide, folioVoid, transferRecord } from './entries';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { wakeLayout } from './wake.layout';
import { lateLayout } from './late.layout';
import { upgradesLayout } from './upgrades.layout';
import { sheetLayout } from './sheet.layout';
import { setCallLayout } from './set-call.layout';
import { approvalsLayout } from './approvals.layout';
import { upsellLayout } from './upsell.layout';
import { folioLayout } from './folio.layout';
import { transferLayout, bookTransferLayout, transferSheetLayout } from './transfer.layout';
import { goodwillLayout } from './goodwill.layout';

// ═══════════════════════════════════════════════════════════
// The Opera bundle — front-office classics the Opera integration ships:
// wake-up calls (guest sets, desk rings), late checkout and paid upgrades
// (guest asks, desk answers, approval posts the price), and the desk-side
// upsell. Same model as ../mews/bundle.ts; see ../types.ts.
// ═══════════════════════════════════════════════════════════

const guestInput = z.toJSONSchema(
  z.object({
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    capability: z.string().optional(),
    sheetTitle: z.string().optional(),
  }),
);

// Every staff surface is preview-capable: the crew screen is COMPOSED from
// resolved slots, so an action that cannot render itself small cannot appear
// on it. `expanded` is the declared marker, exactly as on the guest side.
const staffInput = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional(),
    staffId: z.string().optional(),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full surface.'),
  }),
);

// ─── guest: wake-up call ─────────────────────────────────────
// `chosen` is DECLARED input: an opener (or the agent, typing) may stage the
// time — "wake me at 8" arrives with 08:00 already selected and the guest's
// tap commits it. Staging is free of money, so the whole option is honest.
const wake: ActionDefinition = {
  id: 'ext.guest.opera.wake',
  title: 'Wake-up call',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full surface.'),
      chosen: z
        .object({ label: z.string().optional() })
        .optional()
        .describe('Stage a time from the switchboard list, e.g. { "label": "08:00" } — the guest confirms with "Set the call".'),
    }),
  ),
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, times: [], calls: [], chosen: {}, cancelId: '', loading: true, working: false },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Wake-up call',
        blurb: { $if: '$.calls.length', $then: '{{$.calls.length}} on the sheet — tap to manage', $else: 'Set for tomorrow — the desk rings.' },
        icon: 'moon',
      },
    },
    wakeLayout,
  ),
  endpoints: {
    loadTimes: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'wakecall.set' } },
      target: 'times',
    },
    loadCalls: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'calls' },
    set: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/set', context: { stayId: { $ref: '$.stayId' }, callAt: { $ref: '$.chosen.label' } } } },
    cancel: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/cancel', context: { id: { $ref: '$.cancelId' } } } },
  },
  lifecycle: { mount: [{ call: 'loadTimes', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadCalls' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-time', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.label', '$.chosen.label'] }, $then: {}, $else: '@event.payload' } }] },
    {
      event: 'ui:click',
      ref: 'set',
      do: [
        { set: 'working', value: true },
        { call: 'set', onSuccess: [{ set: 'working', value: false }, { set: 'chosen', value: {} }, { call: 'loadCalls' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'cancelId', value: '@event.payload.call_id' }, { call: 'cancel', onSuccess: [{ call: 'loadCalls' }] }] },
    ...previewTriggers,
  ],
};

// ─── guest: late checkout ────────────────────────────────────
const late: ActionDefinition = {
  id: 'ext.guest.opera.late-checkout',
  title: 'Late checkout',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full surface.'),
    }),
  ),
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, options: [], requests: [], chosen: {}, loading: true, working: false, done: false },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Late checkout',
        blurb: { $if: '$.requests.length', $then: '{{$.requests.length}} request(s) — tap for the answer', $else: 'Keep the room longer on departure day.' },
        icon: 'door',
      },
    },
    lateLayout,
  ),
  endpoints: {
    loadOptions: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'checkout.late' } },
      target: 'options',
    },
    loadRequests: { url: '/api/vex', method: 'POST', request: { fingerprint: 'requests/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'requests' },
    ask: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'requests/raise',
        context: {
          stayId: { $ref: '$.stayId' },
          kind: 'late-checkout',
          label: { $ref: '$.chosen.label' },
          detail: { $ref: '$.chosen.detail' },
          amount: { $ref: '$.chosen.amount' },
        },
      },
    },
  },
  lifecycle: { mount: [{ call: 'loadOptions', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadRequests' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'chosen', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'ask',
      do: [
        { set: 'working', value: true },
        { call: 'ask', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadRequests' }, { emit: { channel: 'requests-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── guest: upgrades ─────────────────────────────────────────
const upgrades: ActionDefinition = {
  id: 'ext.guest.opera.upgrades',
  title: 'Upgrades',
  input: guestInput,
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', offers: [], requests: [], chosen: {}, loading: true, working: false, done: false },
  layout: upgradesLayout,
  endpoints: {
    // Live from the connector — Opera knows which rooms are open tonight.
    loadOffers: { url: '/integrations/con_opera/upgrades', method: 'POST', request: { stay: { $ref: '$.stayId' } }, target: 'offers' },
    loadRequests: { url: '/api/vex', method: 'POST', request: { fingerprint: 'requests/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'requests' },
    ask: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'requests/raise',
        context: {
          stayId: { $ref: '$.stayId' },
          kind: 'upgrade',
          label: { $ref: '$.chosen.name' },
          detail: { $ref: '$.chosen.blurb' },
          amount: { $ref: '$.chosen.price' },
        },
      },
    },
  },
  lifecycle: {
    mount: [
      { call: 'loadOffers', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }, { set: 'offers', value: [] }] },
      { call: 'loadRequests' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'chosen', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'ask',
      do: [
        { set: 'working', value: true },
        { call: 'ask', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadRequests' }, { emit: { channel: 'requests-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
  ],
};

// ─── desk: the call sheet ────────────────────────────────────
const callSheet: ActionDefinition = {
  id: 'ext.desk.opera.call-sheet',
  title: 'Call sheet',
  input: staffInput,
  data: { propertyId: '', staffId: '', calls: [], markId: '', loading: true, expanded: true },
  layout: previewable(
    crewCard('Call sheet', 'moon', { $if: '$.calls.length', $then: '{{$.calls.length}} to ring — first {{$.calls.0.call_at}}, room {{$.calls.0.room_number}}', $else: 'No calls booked.' }),
    sheetLayout,
  ),
  endpoints: {
    loadCalls: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/sheet', context: {} }, target: 'calls' },
    rung: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/setDone', context: { id: { $ref: '$.markId' } } } },
  },
  lifecycle: { mount: [{ call: 'loadCalls', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ event: 'ui:click', ref: 'rung', do: [{ set: 'markId', value: '@event.payload.call_id' }, { call: 'rung', onSuccess: [{ call: 'loadCalls' }] }] }, ...previewTriggers],
};

// ─── desk: set a wake-up call FOR a guest ────────────────────
// The crew half of wakecall.set — a guest asks at the desk (or through their
// assistant) and the desk books the ring. Steerable end to end: `stayId` and
// `chosen` are declared input, so the desk's agent can put this up with the
// guest and the time already staged; the clerk's tap commits.
const setCall: ActionDefinition = {
  id: 'ext.desk.opera.set-call',
  title: 'Set a wake-up call',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Preselect the stay the call is for (from stays/pick).'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      chosen: z.object({ label: z.string().optional() }).optional().describe('Stage a time from the switchboard list, e.g. { "label": "08:00" }.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full switchboard.'),
    }),
  ),
  data: { propertyId: '', staffId: '', times: [], stayId: '', stayLabel: '', chosen: {}, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Set a wake-up call', 'moon', { $if: '$.done', $then: 'Set for {{$.chosen.label}} — {{$.stayLabel}}', $else: 'Book the morning ring for this guest.' }),
    setCallLayout,
  ),
  endpoints: {
    loadTimes: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'wakecall.set' } },
      target: 'times',
    },
    set: { url: '/api/vex', method: 'POST', request: { fingerprint: 'wake/set', context: { stayId: { $ref: '$.stayId' }, callAt: { $ref: '$.chosen.label' } } } },
  },
  lifecycle: { mount: [{ call: 'loadTimes' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-time', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.label', '$.chosen.label'] }, $then: {}, $else: '@event.payload' } }] },
    {
      event: 'ui:click',
      ref: 'set',
      do: [
        { set: 'working', value: true },
        { call: 'set', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── desk: approvals ─────────────────────────────────────────
// Approving decides AND posts: the price the request carried goes to the folio
// in the same gesture. Free options post a zero-rate line — the folio records
// the comp, the way a real one does.
const approvals: ActionDefinition = {
  id: 'ext.desk.opera.approvals',
  title: 'Approvals',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      requestId: z
        .string()
        .optional()
        .describe('Open on ONE guest’s ask, by its request id. Leave it out and the whole queue opens — which is rarely what a clerk working one guest wants.'),
      cardTitle: z
        .string()
        .optional()
        .describe('What this card calls itself. Set it when you aim at one request — "Until 4:00 pm — Marco Bianchi" — so the card is named after the ask rather than after the queue. Leave it out for the whole queue.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
    }),
  ),
  // `cardTitle` is derived, because the name depends on what loaded: aimed at one
  // request this card is that guest's ask, not the queue it came from.
  data: { propertyId: '', staffId: '', requestId: '%', pending: [], cardTitle: 'Approvals', decideId: '', chargeStay: '', chargeLabel: '', chargeAmount: 0, loading: true, expanded: true },
  layout: previewable(
    crewCard('{{$.cardTitle}}', 'check', { $if: '$.pending.length', $then: '{{$.pending.length}} waiting — {{$.pending.0.guest_name}}: {{$.pending.0.label}}', $else: 'Nothing waiting on a yes.' }),
    approvalsLayout,
  ),
  endpoints: {
    loadPending: { url: '/api/vex', method: 'POST', request: { fingerprint: 'requests/pending', context: { requestId: { $ref: '$.requestId' } } }, target: 'pending' },
    approve: { url: '/api/vex', method: 'POST', request: { fingerprint: 'requests/decide', context: { id: { $ref: '$.decideId' }, status: 'approved' } } },
    decline: { url: '/api/vex', method: 'POST', request: { fingerprint: 'requests/decide', context: { id: { $ref: '$.decideId' }, status: 'declined' } } },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.chargeStay' }, description: { $ref: '$.chargeLabel' }, amount: { $ref: '$.chargeAmount' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadPending', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'approve',
      do: [
        { set: 'decideId', value: '@event.payload.request_id' },
        { set: 'chargeStay', value: '@event.payload.stay_id' },
        { set: 'chargeLabel', value: '@event.payload.label' },
        { set: 'chargeAmount', value: '@event.payload.amount' },
        { call: 'approve', onSuccess: [{ call: 'charge', onSuccess: [{ call: 'loadPending' }, { emit: { channel: 'requests-changed' } }] }] },
      ],
    },
    { event: 'ui:click', ref: 'decline', do: [{ set: 'decideId', value: '@event.payload.request_id' }, { call: 'decline', onSuccess: [{ call: 'loadPending' }, { emit: { channel: 'requests-changed' } }] }] },
    { message: 'requests-changed', do: [{ call: 'loadPending' }] },
    ...previewTriggers,
  ],
};

// ─── desk: upsell ────────────────────────────────────────────
const upsell: ActionDefinition = {
  id: 'ext.desk.opera.upsell',
  title: 'Upsell',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      // The same "which guest" contract every other crew surface declares —
      // stayId + stayLabel. Uniform on purpose: `stayId` in an input schema is
      // what marks a surface as guest-scoped, and that is how the workspace
      // knows to seed it with the stay in hand.
      stayId: z.string().optional().describe('Preselect the stay to walk the upgrade to (from stays/pick).'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full offer walk.'),
    }),
  ),
  data: { propertyId: '', staffId: '', offers: [], stayId: '', stayLabel: '', offer: {}, note: '', working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Upsell', 'sparkle', { $if: '$.done', $then: '{{$.offer.name}} sold to {{$.stayLabel}}', $else: '{{$.offers.length}} better rooms open tonight' }),
    upsellLayout,
  ),
  endpoints: {
    loadOffers: { url: '/integrations/con_opera/upgrades', method: 'POST', request: {}, target: 'offers' },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.offer.name' }, amount: { $ref: '$.offer.price' } } },
    },
    // ON BEHALF, in the clerk's own words — sender is the desk because a human
    // at the desk wrote and sent it.
    tell: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'messages/send', context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.note' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadOffers', onError: [{ set: 'offers', value: [] }] }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-offer', do: [{ set: 'offer', value: { $if: { $eq: ['@event.payload.code', '$.offer.code'] }, $then: {}, $else: '@event.payload' } }] },
    { event: 'ui:model', ref: 'note', do: [{ set: 'note', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'apply',
      do: [
        { set: 'working', value: true },
        {
          call: 'charge',
          onSuccess: [{ call: 'tell', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'messages-changed' } }] }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── desk: correct the bill ──────────────────────────────────
// Opera's folio adjustment, as a surface. Stay-scoped (it declares `stayId`),
// so it never sits on the house screen — it arrives in a guest's WORKSPACE,
// already carrying them, which is exactly when a clerk needs it: reading
// "there's a beer on my bill I didn't take".
//
// The order is the whole point. The PMS owns the bill, so the reversal goes
// THERE first; only its answer moves our mirror. A service that is down means
// no reversal and no mirror row changed — the clerk reads why and nothing is
// half-done.
const folio: ActionDefinition = {
  id: 'ext.desk.opera.folio',
  title: 'The bill',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Whose bill to work on.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full bill.'),
    }),
  ),
  data: { propertyId: '', staffId: '', stayId: '', lines: [], total: {}, line: {}, reason: '', reversal: {}, error: '', working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('The bill', 'receipt', { $if: '$.lines.length', $then: '{{$.total.total_display}} over {{$.lines.length}} charges — tap to correct one', $else: 'Nothing posted yet.' }),
    folioLayout,
  ),
  endpoints: {
    loadLines: { url: '/api/vex', method: 'POST', request: { fingerprint: 'folio/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'lines' },
    loadTotal: { url: '/api/vex', method: 'POST', request: { fingerprint: 'folio/total', context: { stayId: { $ref: '$.stayId' } } }, target: 'total' },
    // Opera first. Its reference is what makes the reversal real.
    reverse: {
      url: '/integrations/con_opera/folio/void',
      method: 'POST',
      request: { line: { $ref: '$.line.line_id' }, reason: { $ref: '$.reason' } },
      target: 'reversal',
      errorTarget: 'error',
    },
    // Then the mirror, stamped with the ambient date and the clerk's reason.
    record: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'opera/folioVoid', context: { lineId: { $ref: '$.line.line_id' }, at: { $ref: '$.today' }, reason: { $ref: '$.reason' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadLines' }, { call: 'loadTotal' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick-line',
      do: [
        { set: 'line', value: { $if: { $eq: ['@event.payload.line_id', '$.line.line_id'] }, $then: {}, $else: '@event.payload' } },
        { set: 'done', value: false },
        { set: 'error', value: '' },
      ],
    },
    { event: 'ui:model', ref: 'reason', do: [{ set: 'reason', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'void',
      do: [
        { set: 'working', value: true },
        { set: 'error', value: '' },
        {
          call: 'reverse',
          onSuccess: [
            {
              call: 'record',
              onSuccess: [
                { set: 'working', value: false },
                { set: 'done', value: true },
                { set: 'reason', value: '' },
                { call: 'loadLines' },
                { call: 'loadTotal' },
                { emit: { channel: 'folio-changed' } },
              ],
            },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'folio-changed', do: [{ call: 'loadLines' }, { call: 'loadTotal' }] },
    ...previewTriggers,
  ],
};

// ─── guest: a car to the airport ─────────────────────────────
// The ask a concierge could never serve. `pickupAt` is declared input and it is
// the field that matters: a guest saying "my flight is at 08:20" has told you
// the time without naming it, and an assistant that puts 06:00 in the box has
// done the only piece of thinking on this card. The PRICE is a catalogue row.
const transfer: ActionDefinition = {
  id: 'ext.guest.opera.transfer',
  title: 'Airport transfer',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full booking surface.'),
      chosen: z.object({ option_id: z.string().optional(), label: z.string().optional() }).optional().describe('Stage a route from the list, e.g. { "option_id": "…", "label": "Copenhagen Airport (CPH)" }.'),
      pickupAt: z.string().optional().describe('The pickup time, twenty-four hour, e.g. "06:15". Work it back from the flight if the guest has named one. Allow three hours for an international departure.'),
      direction: z.enum(['arrival', 'departure']).optional().describe('Which way the car runs. Defaults to a departure.'),
    }),
  ),
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, routes: [], transfers: [], chosen: {}, pickupAt: '', direction: 'departure', booked: {}, cancelId: '', error: '', loading: true, working: false, done: false },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Airport transfer',
        blurb: { $if: '$.transfers.length', $then: '{{$.transfers.0.pickup_at}} on {{$.transfers.0.pickup_on}} — tap to manage', $else: 'A car to the airport, booked in two taps.' },
        icon: 'door',
      },
    },
    transferLayout,
  ),
  endpoints: {
    loadRoutes: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'transfer.book' } },
      target: 'routes',
    },
    loadBooked: { url: '/api/vex', method: 'POST', request: { fingerprint: 'transfers/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'transfers' },
    // Opera holds the car contract, so the booking goes there first and only its
    // answer becomes a row. A service that did not answer leaves nothing behind
    // claiming a car is coming.
    book: {
      url: '/integrations/con_opera/transfer/book',
      method: 'POST',
      request: { stay: { $ref: '$.stayId' }, at: { $ref: '$.pickupAt' }, destination: { $ref: '$.chosen.label' }, vehicle: { $ref: '$.chosen.detail' } },
      target: 'booked',
      errorTarget: 'error',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'opera/transferRecord',
        context: {
          stayId: { $ref: '$.stayId' },
          direction: { $ref: '$.direction' },
          pickupOn: { $ref: '$.today' },
          pickupAt: { $ref: '$.pickupAt' },
          destination: { $ref: '$.chosen.label' },
          vehicle: { $ref: '$.chosen.detail' },
          confirmation: { $ref: '$.booked.confirmation' },
        },
      },
    },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.chosen.label' }, amount: { $ref: '$.chosen.amount' } } },
    },
    cancel: { url: '/api/vex', method: 'POST', request: { fingerprint: 'transfers/cancel', context: { id: { $ref: '$.cancelId' } } } },
  },
  lifecycle: { mount: [{ call: 'loadRoutes', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadBooked' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-route', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.option_id', '$.chosen.option_id'] }, $then: {}, $else: '@event.payload' } }, { set: 'error', value: '' }] },
    { event: 'ui:model', ref: 'time', do: [{ set: 'pickupAt', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'again', do: [{ set: 'done', value: false }, { set: 'chosen', value: {} }, { set: 'pickupAt', value: '' }] },
    {
      event: 'ui:click',
      ref: 'book',
      do: [
        { set: 'working', value: true },
        { set: 'error', value: '' },
        {
          call: 'book',
          onSuccess: [
            { call: 'record', onSuccess: [{ call: 'charge', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadBooked' }, { emit: { channel: 'transfers-changed' } }] }] },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'cancelId', value: '@event.payload.transfer_id' }, { call: 'cancel', onSuccess: [{ call: 'loadBooked' }, { emit: { channel: 'transfers-changed' } }] }] },
    { message: 'transfers-changed', do: [{ call: 'loadBooked' }] },
    ...previewTriggers,
  ],
};

// ─── desk: book a car FOR a guest ────────────────────────────
const bookTransfer: ActionDefinition = {
  id: 'ext.desk.opera.book-transfer',
  title: 'Book a car',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Whose car this is.'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      chosen: z.object({ option_id: z.string().optional(), label: z.string().optional() }).optional().describe('Stage a route from the list.'),
      pickupAt: z.string().optional().describe('The pickup time, twenty-four hour. If the guest named a flight, work it back — three hours for an international departure, two for a domestic one.'),
      direction: z.enum(['arrival', 'departure']).optional(),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full booking surface.'),
    }),
  ),
  data: { propertyId: '', staffId: '', stayId: '', stayLabel: '', routes: [], transfers: [], chosen: {}, pickupAt: '', direction: 'departure', booked: {}, cancelId: '', error: '', loading: true, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Book a car', 'door', { $if: '$.transfers.length', $then: 'Booked: {{$.transfers.0.pickup_at}} to {{$.transfers.0.destination}}', $else: 'A car to the airport for this guest.' }),
    bookTransferLayout,
  ),
  endpoints: {
    loadRoutes: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'transfer.book' } },
      target: 'routes',
    },
    loadBooked: { url: '/api/vex', method: 'POST', request: { fingerprint: 'transfers/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'transfers' },
    book: {
      url: '/integrations/con_opera/transfer/book',
      method: 'POST',
      request: { stay: { $ref: '$.stayId' }, at: { $ref: '$.pickupAt' }, destination: { $ref: '$.chosen.label' }, vehicle: { $ref: '$.chosen.detail' } },
      target: 'booked',
      errorTarget: 'error',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'opera/transferRecord',
        context: {
          stayId: { $ref: '$.stayId' },
          direction: { $ref: '$.direction' },
          pickupOn: { $ref: '$.today' },
          pickupAt: { $ref: '$.pickupAt' },
          destination: { $ref: '$.chosen.label' },
          vehicle: { $ref: '$.chosen.detail' },
          confirmation: { $ref: '$.booked.confirmation' },
        },
      },
    },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.chosen.label' }, amount: { $ref: '$.chosen.amount' } } },
    },
    cancel: { url: '/api/vex', method: 'POST', request: { fingerprint: 'transfers/cancel', context: { id: { $ref: '$.cancelId' } } } },
  },
  lifecycle: { mount: [{ call: 'loadRoutes', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadBooked' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-route', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.option_id', '$.chosen.option_id'] }, $then: {}, $else: '@event.payload' } }, { set: 'error', value: '' }] },
    { event: 'ui:model', ref: 'time', do: [{ set: 'pickupAt', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'book',
      do: [
        { set: 'working', value: true },
        { set: 'error', value: '' },
        {
          call: 'book',
          onSuccess: [{ call: 'record', onSuccess: [{ call: 'charge', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadBooked' }, { emit: { channel: 'transfers-changed' } }] }] }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'cancelId', value: '@event.payload.transfer_id' }, { call: 'cancel', onSuccess: [{ call: 'loadBooked' }] }] },
    ...previewTriggers,
  ],
};

// ─── desk: the morning's cars ────────────────────────────────
const transferSheet: ActionDefinition = {
  id: 'ext.desk.opera.transfers',
  title: 'Cars',
  input: staffInput,
  data: { propertyId: '', staffId: '', cars: [], loading: true, expanded: true },
  layout: previewable(
    crewCard('Cars', 'door', { $if: '$.cars.length', $then: '{{$.cars.length}} booked — first {{$.cars.0.pickup_at}}, {{$.cars.0.guest_name}}', $else: 'No cars booked.' }),
    transferSheetLayout,
  ),
  endpoints: {
    loadCars: { url: '/api/vex', method: 'POST', request: { fingerprint: 'transfers/sheet', context: {} }, target: 'cars' },
  },
  lifecycle: { mount: [{ call: 'loadCars', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'open-guest', do: [{ resetTo: { action: 'desk.guest', canvas: 'detail', input: { stayId: '@event.payload.stay_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    { message: 'transfers-changed', do: [{ call: 'loadCars' }] },
    ...previewTriggers,
  ],
};

// ─── desk: putting something right ───────────────────────────
// The credit is `0 - the option's value`, computed in the request rather than
// stored negative, so the menu reads as money a hotel would recognise ("Dinner
// for two · €120") and the folio records a credit. Nothing chooses the number.
const goodwill: ActionDefinition = {
  id: 'ext.desk.opera.goodwill',
  title: 'Goodwill',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Who the gesture is for.'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      chosen: z
        .object({ option_id: z.string().optional(), label: z.string().optional() })
        .optional()
        .describe('Stage a gesture from the published list. Send only these two keys; the value on it is the hotel’s, never yours.'),
      note: z.string().optional().describe('The words that go to the guest with it. Name what went wrong and what has been done, in the guest’s language if the thread is in one.'),
      drafted: z.string().optional().describe('Set this to the same text as `note` when the words are yours, so the card says so.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full surface.'),
    }),
  ),
  data: { propertyId: '', staffId: '', stayId: '', stayLabel: '', gestures: [], given: [], chosen: {}, note: '', drafted: '', error: '', loading: true, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Goodwill', 'sparkle', { $if: '$.given.length', $then: 'Already given: {{$.given.0.description}}', $else: 'A gesture on the bill, and a line to the guest.' }),
    goodwillLayout,
  ),
  endpoints: {
    loadGestures: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'goodwill.grant' } },
      target: 'gestures',
    },
    loadGiven: { url: '/api/vex', method: 'POST', request: { fingerprint: 'goodwill/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'given' },
    credit: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'folio/post',
        context: {
          stayId: { $ref: '$.stayId' },
          // The marked description is what makes `goodwill/forStay` a read over
          // the folio instead of a second table telling a story the bill
          // already tells.
          description: { $join: { parts: ['Goodwill — ', { $ref: '$.chosen.label' }], sep: '' } },
          amount: { $sub: [0, { $ref: '$.chosen.amount' }] },
        },
      },
    },
    tell: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'messages/send', context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.note' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadGestures', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadGiven' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick-gesture', do: [{ set: 'chosen', value: { $if: { $eq: ['@event.payload.option_id', '$.chosen.option_id'] }, $then: {}, $else: '@event.payload' } }] },
    { event: 'ui:model', ref: 'note', do: [{ set: 'note', value: '@event.payload' }, { set: 'drafted', value: '' }] },
    {
      event: 'ui:click',
      ref: 'give',
      do: [
        { set: 'working', value: true },
        {
          call: 'credit',
          onSuccess: [
            {
              call: 'tell',
              onSuccess: [
                { set: 'working', value: false },
                { set: 'done', value: true },
                { call: 'loadGiven' },
                { emit: { channel: 'folio-changed' } },
                { emit: { channel: 'messages-changed' } },
              ],
            },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'folio-changed', do: [{ call: 'loadGiven' }] },
    ...previewTriggers,
  ],
};

export const OPERA_BUNDLE: IntegrationBundle = {
  connector: 'con_opera',
  actions: {
    'ext.guest.opera.wake': wake,
    'ext.guest.opera.late-checkout': late,
    'ext.guest.opera.upgrades': upgrades,
    'ext.guest.opera.transfer': transfer,
    'ext.desk.opera.call-sheet': callSheet,
    'ext.desk.opera.set-call': setCall,
    'ext.desk.opera.approvals': approvals,
    'ext.desk.opera.upsell': upsell,
    'ext.desk.opera.folio': folio,
    'ext.desk.opera.transfers': transferSheet,
    'ext.desk.opera.book-transfer': bookTransfer,
    'ext.desk.opera.goodwill': goodwill,
  },
  entries: [wakeForStay, wakeSheet, requestsPending],
  mutations: [wakeSet, wakeCancel, wakeSetDone, requestRaise, requestDecide, folioVoid, transferRecord],
  // The footprint of the mutations this bundle SHIPS. Folio charges, credits and
  // the notes that go with them run through core fingerprints (folio/post,
  // messages/send) — the endpoint gate's business, not tables this bundle writes
  // itself. `folio_lines` IS here: reversing a charge writes the mirror, after
  // Opera accepted the adjustment.
  tables: ['wake_calls', 'stay_requests', 'folio_lines', 'transfers'],
  slots: [
    // audience, id, action, title, blurb, icon, capability, stay_state, keywords, canvas, position
    ['guest', 'gs_upgrades', 'ext.guest.opera.upgrades', 'Upgrades', 'Ask to move up to a better room at a published price. For wanting more, never for a room that is faulty. Raises a request the desk answers.', 'sparkle', 'upgrade.offer', 'any', 'upgrade suite better room view upsell', 'home', 15],
    ['guest', 'gs_wake', 'ext.guest.opera.wake', 'Wake-up call', 'Set a morning call for tomorrow from the switchboard’s times. Only while in house. Puts the guest on the desk’s call sheet.', 'moon', 'wakecall.set', 'in_house', 'wake up call morning early alarm ring', 'home', 45],
    ['guest', 'gs_late', 'ext.guest.opera.late-checkout', 'Late checkout', 'Ask to keep the room past checkout time on departure day. Only while in house. Raises a request the desk answers; the charge posts if they say yes.', 'door', 'checkout.late', 'in_house', 'late checkout stay longer noon afternoon departure', 'home', 75],
    // Approvals serves two capabilities, so it holds two slots — either one
    // being live places the same surface once (the composition dedups by
    // action). Disable both capabilities and it leaves with them.
    ['desk', 'ds_approvals', 'ext.desk.opera.approvals', 'Approvals', 'Approve or decline an upgrade or a late checkout a guest has asked for. Use when a guest is waiting on a yes; it opens on one guest’s ask or on the whole queue. Answering posts the charge and tells the guest.', 'check', 'upgrade.offer', 'any', 'approvals requests pending upgrades approve decline', 'work', 35],
    ['desk', 'ds_approvals_late', 'ext.desk.opera.approvals', 'Approvals', 'Approve or decline an upgrade or a late checkout a guest has asked for. Use when a guest is waiting on a yes; it opens on one guest’s ask or on the whole queue. Answering posts the charge and tells the guest.', 'check', 'checkout.late', 'any', 'approvals late checkout pending approve decline', 'work', 36],
    // The morning sheet is glanced at all shift — the rail, not the work column.
    ['desk', 'ds_call_sheet', 'ext.desk.opera.call-sheet', 'Call sheet', "Read tomorrow's wake calls in ringing order. A list only — setting a new call is its own action.", 'moon', 'wakecall.set', 'any', 'wake calls sheet morning ring', 'work', 45],
    // Stay-scoped: these belong to a guest, so they arrive in the workspace.
    ['desk', 'ds_set_call', 'ext.desk.opera.set-call', 'Set a wake-up call', 'Book a morning ring for a guest from the switchboard’s times. Use when a guest asks to be woken. Adds them to tomorrow’s call sheet.', 'moon', 'wakecall.set', 'any', 'wake call set new guest morning ring book for', 'aside', 44],
    ['desk', 'ds_upsell', 'ext.desk.opera.upsell', 'Upsell', 'Offer a guest already in house a better room at a price. For selling up — a guest whose own room is faulty is moved with Move rooms instead. Puts an offer to the guest that they answer.', 'sparkle', 'upgrade.offer', 'any', 'upsell upgrade offer sell room', 'aside', 55],
    ['desk', 'ds_opera_folio', 'ext.desk.opera.folio', 'The bill', 'Read a stay’s posted charges and reverse one that should not be there. Use when a charge is wrong or disputed. Credits the folio; the money is off the bill immediately.', 'receipt', 'folio.adjust', 'any', 'bill folio charge remove take off void reverse refund wrong mistake dispute beer minibar', 'aside', 20],
    // Transfers. The guest books their own from home; the desk books one for
    // whoever is in hand; the sheet is what the night porter works from.
    ['guest', 'gs_transfer', 'ext.guest.opera.transfer', 'Airport transfer', 'Book a car between the hotel and one of the published destinations, at a chosen time. Use when the guest needs a lift to a flight or a train — work the pickup back from the departure. Confirms the car and puts the fare on the bill.', 'door', 'transfer.book', 'any', 'taxi car transfer airport flight lift ride pickup cab kastrup drive station train', 'home', 76],
    ['desk', 'ds_transfers', 'ext.desk.opera.transfers', 'Cars', 'Read the cars already booked, in leaving order. A list only — booking one is its own action.', 'door', 'transfer.book', 'any', 'cars transfers taxis airport pickups sheet morning', 'work', 46],
    ['desk', 'ds_book_transfer', 'ext.desk.opera.book-transfer', 'Book a car', 'Book a car for a guest from the published routes at a chosen time. Use when a guest asks for a taxi, a lift or a run to the airport — work the pickup back from their flight. Confirms the car and puts the fare on the folio.', 'door', 'transfer.book', 'any', 'taxi car transfer airport flight book for guest cab pickup ride kastrup', 'aside', 45],
    // Goodwill is desk-only and always will be. A guest surface that hands out
    // credits is not a gesture, it is a discount code.
    ['desk', 'ds_goodwill', 'ext.desk.opera.goodwill', 'Goodwill', 'Give a guest something from the hotel’s published list and write the line that goes with it. Use whenever a gesture is warranted — to put right a fault the hotel caused, or unprompted for an anniversary, a regular, or a stay worth marking. Only what the list offers can be given. Credits the folio and sends the words, once the user presses it.', 'sparkle', 'goodwill.grant', 'any', 'goodwill comp compensate apology sorry gesture credit make it right upset complaint unhappy free', 'aside', 15],
  ],
  options: [
    // capability, label, detail, icon, kind, amount, position
    // The switchboard's times — what Opera's wake-call module accepts.
    ['wakecall.set', '05:30', '', 'moon', 'wake', 0, 10],
    ['wakecall.set', '06:00', '', 'moon', 'wake', 0, 20],
    ['wakecall.set', '06:30', '', 'moon', 'wake', 0, 30],
    ['wakecall.set', '07:00', '', 'moon', 'wake', 0, 40],
    ['wakecall.set', '07:30', '', 'moon', 'wake', 0, 50],
    ['wakecall.set', '08:00', '', 'moon', 'wake', 0, 60],
    ['wakecall.set', '08:30', '', 'moon', 'wake', 0, 70],
    ['wakecall.set', '09:00', '', 'moon', 'wake', 0, 80],
    // Late checkout tiers, priced by the PMS.
    ['checkout.late', 'Until 2:00 pm', 'On the house', 'door', 'late-checkout', 0, 10],
    ['checkout.late', 'Until 4:00 pm', 'Half-day rate', 'door', 'late-checkout', 45, 20],
    ['checkout.late', 'Until 6:00 pm', 'Evening departure', 'door', 'late-checkout', 90, 30],
    // The car routes — destination, vehicle and price, all Opera's. The TIME is
    // not here on purpose: what hour a car should come is a fact about a flight
    // nobody has told the database about, so it is typed (or suggested) rather
    // than picked from a menu that could only ever be wrong.
    ['transfer.book', 'Copenhagen Airport (CPH)', 'Saloon, up to three bags', 'door', 'transfer', 55, 10],
    ['transfer.book', 'Copenhagen Airport (CPH) — estate', 'Estate car, up to five bags', 'door', 'transfer', 75, 20],
    ['transfer.book', 'Copenhagen Central Station', 'Saloon', 'door', 'transfer', 35, 30],
    // What the house is willing to give away, priced by somebody allowed to
    // price things. This list is the ONLY set of gestures that can be made, and
    // that is what makes it safe for a machine to choose from it.
    ['goodwill.grant', 'Breakfast for two', 'Comped tomorrow morning', 'sparkle', 'goodwill', 44, 10],
    ['goodwill.grant', 'A bottle of wine to the room', 'With the compliments of the house', 'sparkle', 'goodwill', 38, 20],
    ['goodwill.grant', 'Dinner for two', 'In the restaurant, up to the cover', 'sparkle', 'goodwill', 120, 30],
    ['goodwill.grant', 'One night at half rate', 'Applied to tonight', 'receipt', 'goodwill', 120, 40],
    ['goodwill.grant', 'Late checkout, no charge', 'Until four on departure day', 'door', 'goodwill', 0, 50],
  ],
};
