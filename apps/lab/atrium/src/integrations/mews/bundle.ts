import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { IntegrationBundle } from '../types';
import { spaRecord, spaForStay, spaDiary, spaSetStatus, spaByTreatment, folioVoid, transferRecord } from './entries';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { spaLayout } from './spa.layout';
import { visitsLayout } from './visits.layout';
import { minibarLayout } from './minibar.layout';
import { diaryLayout } from './diary.layout';
import { deskSpaLayout } from './desk-spa.layout';
import { postMinibarLayout } from './post-minibar.layout';
import { reportLayout } from './report.layout';
import { folioLayout } from './folio.layout';
import { transferLayout, bookTransferLayout, transferSheetLayout, goodwillLayout } from './transfer.layout';

// ═══════════════════════════════════════════════════════════
// The Mews bundle — what the Mews integration SHIPS beyond its API.
//
// Reporting `spa.book` and `minibar.post` commits this connector to the
// surfaces that make them work: the guest books and pays, the desk runs the
// diary, ops reads utilization. All of it lands as rows at seed time and is
// loaded from the database at boot — see ../types.ts for the model.
//
// Input contracts are uniform per audience (rule 14): guest actions take the
// concierge quad, staff actions take { propertyId, staffId } from the chrome.
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

// ─── guest: book the spa ─────────────────────────────────────
// Treatments from catalogue rows; SLOTS live from the connector (it owns
// availability); the book call goes to the connector, and only its confirmed
// answer becomes our mirror row plus the folio charge.
const spaBook: ActionDefinition = {
  id: 'ext.guest.mews.spa',
  title: 'The spa',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full booking surface.'),
    }),
  ),
  data: {
    stayId: '',
    propertyId: '',
    capability: '',
    sheetTitle: '',
    expanded: true,
    treatments: [],
    slots: [],
    treatment: {},
    slot: {},
    booked: {},
    loading: true,
    slotsLoading: false,
    working: false,
    done: false,
  },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: { title: 'The spa', blurb: '{{$.treatments.length}} treatments — live times, booked in one go', icon: 'leaf' },
    },
    spaLayout,
  ),
  endpoints: {
    loadTreatments: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'spa.book' } },
      target: 'treatments',
    },
    // Live availability — the connector's, not ours. If the service is down the
    // guest reads "fully booked" and nothing is claimed.
    loadSlots: {
      url: '/integrations/con_mews/spa/slots',
      method: 'POST',
      request: { treatment: { $ref: '$.treatment.label' } },
      target: 'slots',
    },
    book: {
      url: '/integrations/con_mews/spa/book',
      method: 'POST',
      request: { treatment: { $ref: '$.treatment.label' }, at: { $ref: '$.slot.at' }, stay: { $ref: '$.stayId' } },
      target: 'booked',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'spa/record',
        context: {
          stayId: { $ref: '$.stayId' },
          treatment: { $ref: '$.booked.treatment' },
          slotAt: { $ref: '$.booked.at' },
          confirmation: { $ref: '$.booked.confirmation' },
        },
      },
    },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'folio/post',
        context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.booked.treatment' }, amount: { $ref: '$.treatment.amount' } },
      },
    },
  },
  lifecycle: { mount: [{ call: 'loadTreatments', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick-treatment',
      do: [
        { set: 'treatment', value: { $if: { $eq: ['@event.payload.option_id', '$.treatment.option_id'] }, $then: {}, $else: '@event.payload' } },
        { set: 'slot', value: {} },
        { set: 'slots', value: [] },
        { set: 'slotsLoading', value: true },
        { call: 'loadSlots', onSuccess: [{ set: 'slotsLoading', value: false }], onError: [{ set: 'slotsLoading', value: false }, { set: 'slots', value: [] }] },
      ],
    },
    { event: 'ui:click', ref: 'pick-slot', do: [{ set: 'slot', value: { $if: { $eq: ['@event.payload.slot_id', '$.slot.slot_id'] }, $then: {}, $else: '@event.payload' } }] },
    {
      event: 'ui:click',
      ref: 'book',
      do: [
        { set: 'working', value: true },
        {
          call: 'book',
          onSuccess: [{ call: 'record', onSuccess: [{ call: 'charge', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'spa-changed' } }] }] }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── guest: your treatments ──────────────────────────────────
const spaVisits: ActionDefinition = {
  id: 'ext.guest.mews.spa-visits',
  title: 'Your treatments',
  input: guestInput,
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', visits: [], cancelId: '' },
  layout: visitsLayout,
  endpoints: {
    loadVisits: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/forStay', context: { stayId: { $ref: '$.stayId' } } }, target: 'visits' },
    cancel: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/setStatus', context: { id: { $ref: '$.cancelId' }, status: 'cancelled' } } },
  },
  lifecycle: { mount: [{ call: 'loadVisits' }] },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'cancelId', value: '@event.payload.booking_id' }, { call: 'cancel', onSuccess: [{ call: 'loadVisits' }, { emit: { channel: 'spa-changed' } }] }] },
    { message: 'spa-changed', do: [{ call: 'loadVisits' }] },
  ],
};

// ─── guest: the minibar ──────────────────────────────────────
const minibar: ActionDefinition = {
  id: 'ext.guest.mews.minibar',
  title: 'Minibar',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full honesty bar.'),
    }),
  ),
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, items: [], chosen: {}, lastItem: {}, loading: true, working: false, posted: false },
  layout: previewable(
    {
      component: 'Tile',
      ref: 'expand',
      props: {
        title: 'Minibar',
        blurb: { $if: '$.posted', $then: 'Last: {{$.lastItem.label}} · {{$.lastItem.amount_display}} — tap for more', $else: '{{$.items.length}} items — tap what you took' },
        icon: 'receipt',
      },
    },
    minibarLayout,
  ),
  endpoints: {
    loadItems: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'minibar.post' } },
      target: 'items',
    },
    post: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.chosen.label' }, amount: { $ref: '$.chosen.amount' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadItems', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Tapping an item STAGES it. It used to post the charge on the spot, so a
    // mis-tap was money on the bill with no undo — the exact complaint that
    // made folio.adjust necessary in the first place. Now: tap to choose, tap
    // the same one again to unchoose, and a separate press commits.
    {
      event: 'ui:click',
      ref: 'take',
      do: [
        { set: 'chosen', value: { $if: { $eq: ['@event.payload.option_id', '$.chosen.option_id'] }, $then: {}, $else: '@event.payload' } },
        { set: 'posted', value: false },
      ],
    },
    {
      event: 'ui:click',
      ref: 'add',
      do: [
        { set: 'working', value: true },
        { call: 'post', onSuccess: [{ set: 'working', value: false }, { set: 'posted', value: true }, { set: 'lastItem', from: 'chosen' }, { set: 'chosen', value: {} }, { emit: { channel: 'folio-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── desk: the diary ─────────────────────────────────────────
const diary: ActionDefinition = {
  id: 'ext.desk.mews.spa-diary',
  title: 'Spa diary',
  input: staffInput,
  data: { propertyId: '', staffId: '', diary: [], loading: true, markId: '', expanded: true },
  layout: previewable(
    crewCard('Spa diary', 'leaf', { $if: '$.diary.length', $then: 'Next: {{$.diary.0.when_display}} — {{$.diary.0.guest_name}}, {{$.diary.0.treatment}}', $else: 'Nothing on the table.' }),
    diaryLayout,
  ),
  endpoints: {
    loadDiary: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/diary', context: {} }, target: 'diary' },
    markDone: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/setStatus', context: { id: { $ref: '$.markId' }, status: 'done' } } },
    markNoshow: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/setStatus', context: { id: { $ref: '$.markId' }, status: 'no_show' } } },
    markCancel: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/setStatus', context: { id: { $ref: '$.markId' }, status: 'cancelled' } } },
  },
  lifecycle: { mount: [{ call: 'loadDiary', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'mark-done', do: [{ set: 'markId', value: '@event.payload.booking_id' }, { call: 'markDone', onSuccess: [{ call: 'loadDiary' }] }] },
    { event: 'ui:click', ref: 'mark-noshow', do: [{ set: 'markId', value: '@event.payload.booking_id' }, { call: 'markNoshow', onSuccess: [{ call: 'loadDiary' }] }] },
    { event: 'ui:click', ref: 'mark-cancel', do: [{ set: 'markId', value: '@event.payload.booking_id' }, { call: 'markCancel', onSuccess: [{ call: 'loadDiary' }] }] },
    { message: 'spa-changed', do: [{ call: 'loadDiary' }] },
    ...previewTriggers,
  ],
};

// ─── desk: book the spa FOR a guest ──────────────────────────
// The crew half of spa.book — a guest asks at the desk (or their assistant
// hands it off) and the clerk books it: same connector slots, same mirror
// row, same folio charge as the guest's own booking.
const deskSpaBook: ActionDefinition = {
  id: 'ext.desk.mews.spa-book',
  title: 'Book the spa',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Preselect the stay the booking is for (from stays/pick).'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full booking surface.'),
    }),
  ),
  data: { propertyId: '', staffId: '', treatments: [], slots: [], stayId: '', stayLabel: '', treatment: {}, slot: {}, booked: {}, slotsLoading: false, working: false, done: false, expanded: true },
  layout: previewable(
    crewCard('Book the spa', 'leaf', { $if: '$.done', $then: 'Booked — {{$.booked.when_label}}', $else: '{{$.treatments.length}} treatments, live times — book one for this guest' }),
    deskSpaLayout,
  ),
  endpoints: {
    loadTreatments: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'spa.book' } },
      target: 'treatments',
    },
    loadSlots: { url: '/integrations/con_mews/spa/slots', method: 'POST', request: { treatment: { $ref: '$.treatment.label' } }, target: 'slots' },
    book: { url: '/integrations/con_mews/spa/book', method: 'POST', request: { treatment: { $ref: '$.treatment.label' }, at: { $ref: '$.slot.at' }, stay: { $ref: '$.stayId' } }, target: 'booked' },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'spa/record',
        context: { stayId: { $ref: '$.stayId' }, treatment: { $ref: '$.booked.treatment' }, slotAt: { $ref: '$.booked.at' }, confirmation: { $ref: '$.booked.confirmation' } },
      },
    },
    charge: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.booked.treatment' }, amount: { $ref: '$.treatment.amount' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadTreatments' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick-treatment',
      do: [
        { set: 'treatment', value: { $if: { $eq: ['@event.payload.option_id', '$.treatment.option_id'] }, $then: {}, $else: '@event.payload' } },
        { set: 'slot', value: {} },
        { set: 'slots', value: [] },
        { set: 'slotsLoading', value: true },
        { call: 'loadSlots', onSuccess: [{ set: 'slotsLoading', value: false }], onError: [{ set: 'slotsLoading', value: false }, { set: 'slots', value: [] }] },
      ],
    },
    { event: 'ui:click', ref: 'pick-slot', do: [{ set: 'slot', value: { $if: { $eq: ['@event.payload.slot_id', '$.slot.slot_id'] }, $then: {}, $else: '@event.payload' } }] },
    {
      event: 'ui:click',
      ref: 'book',
      do: [
        { set: 'working', value: true },
        {
          call: 'book',
          onSuccess: [{ call: 'record', onSuccess: [{ call: 'charge', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { emit: { channel: 'spa-changed' } }] }] }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── desk: post minibar FOR a guest ──────────────────────────
const postMinibar: ActionDefinition = {
  id: 'ext.desk.mews.post-minibar',
  title: 'Post minibar',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Preselect the stay to post against (from stays/pick).'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      expanded: z.boolean().optional().describe('false renders the one-line card (the guest workspace); true (default) the full honesty bar.'),
    }),
  ),
  data: { propertyId: '', staffId: '', items: [], stayId: '', stayLabel: '', chosen: {}, lastItem: {}, working: false, posted: false, expanded: true },
  layout: previewable(
    crewCard('Post minibar', 'receipt', { $if: '$.posted', $then: 'Last posted: {{$.lastItem.label}} · {{$.lastItem.amount_display}}', $else: '{{$.items.length}} items' }),
    postMinibarLayout,
  ),
  endpoints: {
    loadItems: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'catalog/requestOptions', context: { propertyId: { $ref: '$.propertyId' }, capabilityId: 'minibar.post' } },
      target: 'items',
    },
    post: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'folio/post', context: { stayId: { $ref: '$.stayId' }, description: { $ref: '$.chosen.label' }, amount: { $ref: '$.chosen.amount' } } },
    },
  },
  lifecycle: { mount: [{ call: 'loadItems' }] },
  triggers: [
    // Choose, then post — the desk half obeys the same rule as the guest's
    // honesty bar: a tap must never be a charge.
    {
      event: 'ui:click',
      ref: 'pick-item',
      do: [
        { set: 'chosen', value: { $if: { $eq: ['@event.payload.option_id', '$.chosen.option_id'] }, $then: {}, $else: '@event.payload' } },
        { set: 'posted', value: false },
      ],
    },
    {
      event: 'ui:click',
      ref: 'post',
      do: [
        { set: 'working', value: true },
        { call: 'post', onSuccess: [{ set: 'working', value: false }, { set: 'posted', value: true }, { set: 'lastItem', from: 'chosen' }, { set: 'chosen', value: {} }, { emit: { channel: 'folio-changed' } }], onError: [{ set: 'working', value: false }] },
      ],
    },
    ...previewTriggers,
  ],
};

// ─── ops: utilization ────────────────────────────────────────
const report: ActionDefinition = {
  id: 'ext.ops.mews.spa-report',
  title: 'Spa utilization',
  input: staffInput,
  data: { propertyId: '', staffId: '', report: [], expanded: true },
  layout: previewable(
    crewCard('Spa utilization', 'chart', { $if: '$.report.length', $then: 'Top: {{$.report.0.treatment}} — {{$.report.0.count}} {{$.report.0.status}}', $else: 'No bookings to report yet.' }),
    reportLayout,
  ),
  endpoints: {
    loadReport: { url: '/api/vex', method: 'POST', request: { fingerprint: 'spa/byTreatment', context: {} }, target: 'report' },
  },
  lifecycle: { mount: [{ call: 'loadReport' }] },
  triggers: [{ message: 'spa-changed', do: [{ call: 'loadReport' }] }, ...previewTriggers],
};

// ─── desk: void a bill item ──────────────────────────────────
// Mews' half of folio.adjust. Stay-scoped, so it arrives in a guest's
// WORKSPACE rather than on the house screen — which is where a clerk reading
// "I accidentally added a local beer to my bill" actually needs it.
const folio: ActionDefinition = {
  id: 'ext.desk.mews.folio',
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
    reverse: {
      url: '/integrations/con_mews/folio/void',
      method: 'POST',
      request: { line: { $ref: '$.line.line_id' }, reason: { $ref: '$.reason' } },
      target: 'reversal',
      errorTarget: 'error',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: 'mews/folioVoid', context: { lineId: { $ref: '$.line.line_id' }, at: { $ref: '$.today' }, reason: { $ref: '$.reason' } } },
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
const transfer: ActionDefinition = {
  id: 'ext.guest.mews.transfer',
  title: 'Airport transfer',
  input: z.toJSONSchema(
    z.object({
      stayId: z.string().optional(),
      propertyId: z.string().optional(),
      capability: z.string().optional(),
      sheetTitle: z.string().optional(),
      expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full booking surface.'),
      chosen: z.object({ option_id: z.string().optional(), label: z.string().optional() }).optional().describe('Stage a route from the list.'),
      pickupAt: z.string().optional().describe('The pickup time, twenty-four hour, e.g. "07:30". Work it back from the flight if the guest has named one.'),
      direction: z.enum(['arrival', 'departure']).optional(),
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
    book: {
      url: '/integrations/con_mews/transfer/book',
      method: 'POST',
      request: { stay: { $ref: '$.stayId' }, at: { $ref: '$.pickupAt' }, destination: { $ref: '$.chosen.label' }, vehicle: { $ref: '$.chosen.detail' } },
      target: 'booked',
      errorTarget: 'error',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'mews/transferRecord',
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
          onSuccess: [{ call: 'record', onSuccess: [{ call: 'charge', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadBooked' }, { emit: { channel: 'transfers-changed' } }] }] }],
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
  id: 'ext.desk.mews.book-transfer',
  title: 'Book a car',
  input: z.toJSONSchema(
    z.object({
      propertyId: z.string().optional(),
      staffId: z.string().optional(),
      stayId: z.string().optional().describe('Whose car this is.'),
      stayLabel: z.string().optional().describe('The guest’s name, for the confirmation line.'),
      chosen: z.object({ option_id: z.string().optional(), label: z.string().optional() }).optional().describe('Stage a route from the list.'),
      pickupAt: z.string().optional().describe('The pickup time, twenty-four hour. Work it back from the flight if the guest has named one.'),
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
      url: '/integrations/con_mews/transfer/book',
      method: 'POST',
      request: { stay: { $ref: '$.stayId' }, at: { $ref: '$.pickupAt' }, destination: { $ref: '$.chosen.label' }, vehicle: { $ref: '$.chosen.detail' } },
      target: 'booked',
      errorTarget: 'error',
    },
    record: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: 'mews/transferRecord',
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

// ─── desk: the day's cars ────────────────────────────────────
const transferSheet: ActionDefinition = {
  id: 'ext.desk.mews.transfers',
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

// ─── desk: goodwill ──────────────────────────────────────────
const goodwill: ActionDefinition = {
  id: 'ext.desk.mews.goodwill',
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
      note: z.string().optional().describe('The words that go to the guest with it. Their language if the thread is in one.'),
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
            { call: 'tell', onSuccess: [{ set: 'working', value: false }, { set: 'done', value: true }, { call: 'loadGiven' }, { emit: { channel: 'folio-changed' } }, { emit: { channel: 'messages-changed' } }] },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { message: 'folio-changed', do: [{ call: 'loadGiven' }] },
    ...previewTriggers,
  ],
};

export const MEWS_BUNDLE: IntegrationBundle = {
  connector: 'con_mews',
  actions: {
    'ext.guest.mews.spa': spaBook,
    'ext.guest.mews.spa-visits': spaVisits,
    'ext.guest.mews.minibar': minibar,
    'ext.desk.mews.spa-diary': diary,
    'ext.desk.mews.spa-book': deskSpaBook,
    'ext.desk.mews.post-minibar': postMinibar,
    'ext.ops.mews.spa-report': report,
    'ext.desk.mews.folio': folio,
    'ext.guest.mews.transfer': transfer,
    'ext.desk.mews.transfers': transferSheet,
    'ext.desk.mews.book-transfer': bookTransfer,
    'ext.desk.mews.goodwill': goodwill,
  },
  entries: [spaForStay, spaDiary, spaByTreatment],
  mutations: [spaRecord, spaSetStatus, folioVoid, transferRecord],
  // The footprint of the mutations this bundle SHIPS. Charges and credits go
  // through the core folio/post fingerprint — calling core is the endpoint
  // gate's business, not a table this bundle writes itself. `folio_lines` IS
  // here: voiding a bill item writes the mirror, after Mews accepted the void.
  tables: ['spa_bookings', 'folio_lines', 'transfers'],
  slots: [
    // audience, id, action, title, blurb, icon, capability, stay_state, keywords, canvas, position
    ['guest', 'gs_spa', 'ext.guest.mews.spa', 'The spa', 'Book a treatment from the times actually free today. Use when the guest wants the spa; what is offered comes from the property, not from a fixed menu. Confirms the slot and posts the price.', 'leaf', 'spa.book', 'any', 'spa massage treatment sauna wellness facial book', 'home', 50],
    ['guest', 'gs_spa_visits', 'ext.guest.mews.spa-visits', 'Your treatments', 'Read treatments booked and already taken, and cancel one that is still to come. Cancelling frees the slot.', 'sparkle', 'spa.book', 'any', 'spa booked upcoming cancel treatment appointment', 'home', 52],
    ['guest', 'gs_minibar', 'ext.guest.mews.minibar', 'Minibar', 'Put items taken from the minibar onto the bill. Only while in house. Charges the folio straight away.', 'receipt', 'minibar.post', 'in_house', 'minibar drink snack water beer chocolate bill honesty', 'home', 58],
    ['desk', 'ds_spa_diary', 'ext.desk.mews.spa-diary', 'Spa diary', 'Read who is booked onto the table today and at what time. A list only — booking a guest in is its own action.', 'leaf', 'spa.book', 'any', 'spa diary bookings treatments today no-show', 'work', 50],
    ['ops', 'op_spa_report', 'ext.ops.mews.spa-report', 'Spa utilization', 'Read how many treatments were booked, by kind, and how they ended. Counts only — nothing here can be acted on.', 'chart', 'spa.book', 'any', 'spa utilization report bookings revenue', 'work', 50],
    // Stay-scoped: these belong to a guest, so they arrive in the workspace.
    ['desk', 'ds_spa_book', 'ext.desk.mews.spa-book', 'Book the spa', 'Reserve a treatment for a guest in house, from the times actually free. Use when a guest asks for the spa. Confirms the slot and posts the price.', 'leaf', 'spa.book', 'any', 'spa book guest treatment massage reserve for', 'aside', 48],
    ['desk', 'ds_post_minibar', 'ext.desk.mews.post-minibar', 'Post minibar', 'Put items a guest has taken from the minibar onto their folio. Use whenever the desk learns something was taken — restocking finds it gone, the guest says so, or it comes up at checkout. Charges the folio.', 'receipt', 'minibar.post', 'any', 'minibar post charge folio guest items water beer', 'aside', 52],
    ['desk', 'ds_mews_folio', 'ext.desk.mews.folio', 'The bill', 'Read a stay’s posted charges and reverse one that should not be there. Use when a charge is wrong or disputed. Credits the folio; the money is off the bill immediately.', 'receipt', 'folio.adjust', 'any', 'bill folio charge remove take off void refund wrong mistake dispute beer minibar', 'aside', 20],
    ['guest', 'gs_mews_transfer', 'ext.guest.mews.transfer', 'Airport transfer', 'Book a car between the hotel and one of the published destinations, at a chosen time. Use when the guest needs a lift to a flight or a train — work the pickup back from the departure. Confirms the car and puts the fare on the bill.', 'door', 'transfer.book', 'any', 'taxi car transfer airport flight lift ride pickup cab palma drive', 'home', 76],
    ['desk', 'ds_mews_transfers', 'ext.desk.mews.transfers', 'Cars', 'Read the cars already booked, in leaving order. A list only — booking one is its own action.', 'door', 'transfer.book', 'any', 'cars transfers taxis airport pickups sheet', 'work', 46],
    ['desk', 'ds_mews_book_transfer', 'ext.desk.mews.book-transfer', 'Book a car', 'Book a car for a guest from the published routes at a chosen time. Use when a guest asks for a taxi, a lift or a run to the airport — work the pickup back from their flight. Confirms the car and puts the fare on the folio.', 'door', 'transfer.book', 'any', 'taxi car transfer airport flight book for guest cab pickup ride palma', 'aside', 45],
    ['desk', 'ds_mews_goodwill', 'ext.desk.mews.goodwill', 'Goodwill', 'Give a guest something from the hotel’s published list and write the line that goes with it. Use whenever a gesture is warranted — to put right a fault the hotel caused, or unprompted for an anniversary, a regular, or a stay worth marking. Only what the list offers can be given. Credits the folio and sends the words, once the user presses it.', 'sparkle', 'goodwill.grant', 'any', 'goodwill comp compensate apology sorry gesture credit make it right upset complaint unhappy free', 'aside', 15],
  ],
  options: [
    // capability, label, detail, icon, kind, amount, position
    // The spa card — priced; what the guest's booking charges to the room.
    ['spa.book', '60-minute massage', 'Deep tissue or relaxation', 'leaf', 'spa', 890, 10],
    ['spa.book', 'Facial', 'Signature or hydrating', 'sparkle', 'spa', 750, 20],
    ['spa.book', 'Hammam ritual', 'Steam, scrub and rest', 'leaf', 'spa', 1100, 30],
    ['spa.book', 'Treatment for two', 'Side-by-side, 90 minutes', 'leaf', 'spa', 1900, 40],
    // Housekeeping — free, and still the connector's list, not ours.
    ['housekeeping.request', 'Fresh towels', '', 'sparkle', 'housekeeping', 0, 10],
    ['housekeeping.request', 'Turndown this evening', '', 'moon', 'housekeeping', 0, 20],
    ['housekeeping.request', 'Skip my room today', '', 'close', 'housekeeping', 0, 30],
    ['housekeeping.request', 'Extra pillows', '', 'bed', 'housekeeping', 0, 40],
    // The minibar card.
    ['minibar.post', 'Still water', 'Half-litre, chilled', 'dot', 'minibar', 6, 10],
    ['minibar.post', 'Sparkling water', 'Half-litre, chilled', 'dot', 'minibar', 6, 20],
    ['minibar.post', 'Local beer', 'Island lager, 330ml', 'dot', 'minibar', 9, 30],
    ['minibar.post', 'Rioja, half bottle', 'Crianza, 375ml', 'dot', 'minibar', 24, 40],
    ['minibar.post', 'Almonds & olives', 'Marcona, manzanilla', 'dot', 'minibar', 12, 50],
    ['minibar.post', 'Dark chocolate', 'Mallorcan sea salt', 'dot', 'minibar', 8, 60],
    // Mews' own fleet and its own prices. The routes differ from Opera's because
    // the hotels are in different countries — which is the point of the menu
    // being a connector row rather than a constant in a layout.
    ['transfer.book', 'Palma Airport (PMI)', 'Saloon, up to three bags', 'door', 'transfer', 45, 10],
    ['transfer.book', 'Palma Airport (PMI) — estate', 'Estate car, up to five bags', 'door', 'transfer', 65, 20],
    ['transfer.book', 'Palma old town', 'Saloon, twenty minutes', 'door', 'transfer', 25, 30],
    // And its own idea of what putting something right looks like — a spa
    // treatment is a gesture here and is not one in Copenhagen.
    ['goodwill.grant', 'Breakfast for two', 'Comped tomorrow morning', 'sparkle', 'goodwill', 36, 10],
    ['goodwill.grant', 'A bottle of cava to the casita', 'With the compliments of the house', 'sparkle', 'goodwill', 28, 20],
    ['goodwill.grant', 'A treatment at the spa', 'Any sixty-minute treatment, on the house', 'leaf', 'goodwill', 89, 30],
    ['goodwill.grant', 'One night at half rate', 'Applied to tonight', 'receipt', 'goodwill', 130, 40],
  ],
};
