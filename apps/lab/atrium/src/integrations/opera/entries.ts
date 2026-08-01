import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { dateText, money, stampText, statusTone } from '@atrium/app/prisms/format.prism';

// The Opera bundle's data surface. Wake calls and stay requests are OUR mirror
// tables; `property_id` is stamped and matched by the tenant behaviors, so no
// query here mentions it.

// ─── wake calls ──────────────────────────────────────────────

// The table default dates the call for tomorrow — a call set tonight is for
// tomorrow morning, which is the only wake call a hotel sells.
export const wakeSet: SeedMutation = {
  fingerprint: 'wake/set',
  intent: 'Set a wake-up call for tomorrow morning',
  mutation: {
    op: 'insert',
    table: 'wake_calls',
    values: {
      stay_id: { $context: 'stayId' },
      call_at: { $context: 'callAt' },
    },
  },
};

export const wakeForStay: SeedEntry = {
  fingerprint: 'wake/forStay',
  intent: "One stay's wake-up calls, soonest first",
  shape: [{ call_id: '', call_on: '', call_at: '', status: '', status_tone: '' }],
  dsl: {
    from: ['wake_calls'],
    fields: [{ field: 'wake_calls.id', as: 'call_id' }, 'wake_calls.call_on', 'wake_calls.call_at', 'wake_calls.status'],
    filter: { eq: ['wake_calls.stay_id', { $context: 'stayId' }] },
    sort: [
      { field: 'wake_calls.call_on', dir: 'asc' },
      { field: 'wake_calls.call_at', dir: 'asc' },
    ],
    limit: 10,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        call_id: { $get: { from: { $var: 'r' }, path: ['call_id'] } },
        call_on: dateText({ $get: { from: { $var: 'r' }, path: ['call_on'] } }),
        call_at: { $get: { from: { $var: 'r' }, path: ['call_at'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
      },
    },
  },
};

export const wakeCancel: SeedMutation = {
  fingerprint: 'wake/cancel',
  intent: 'Cancel a wake-up call',
  mutation: {
    op: 'update',
    table: 'wake_calls',
    set: { status: 'cancelled' },
    where: { eq: ['wake_calls.id', { $context: 'id' }] },
  },
};

// The desk's call sheet — scheduled calls in ringing order, with room and name.
export const wakeSheet: SeedEntry = {
  fingerprint: 'wake/sheet',
  intent: "The property's scheduled wake-up calls in ringing order",
  shape: [{ call_id: '', call_on: '', call_at: '', guest_name: '', room_number: '' }],
  dsl: {
    from: ['wake_calls', 'stays', 'guests', 'rooms'],
    fields: [
      { field: 'wake_calls.id', as: 'call_id' },
      'wake_calls.call_on',
      'wake_calls.call_at',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: { eq: ['wake_calls.status', 'scheduled'] },
    sort: [
      { field: 'wake_calls.call_on', dir: 'asc' },
      { field: 'wake_calls.call_at', dir: 'asc' },
    ],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        call_id: { $get: { from: { $var: 'r' }, path: ['call_id'] } },
        call_on: dateText({ $get: { from: { $var: 'r' }, path: ['call_on'] } }),
        call_at: { $get: { from: { $var: 'r' }, path: ['call_at'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
      },
    },
  },
};

export const wakeSetDone: SeedMutation = {
  fingerprint: 'wake/setDone',
  intent: 'Mark a wake-up call rung',
  mutation: {
    op: 'update',
    table: 'wake_calls',
    set: { status: 'done' },
    where: { eq: ['wake_calls.id', { $context: 'id' }] },
  },
};

// ─── stay requests: the human-yes queue ──────────────────────

export const requestRaise: SeedMutation = {
  fingerprint: 'requests/raise',
  intent: 'Raise a stay request that needs a human yes',
  mutation: {
    op: 'insert',
    table: 'stay_requests',
    values: {
      stay_id: { $context: 'stayId' },
      kind: { $context: 'kind' },
      label: { $context: 'label' },
      detail: { $context: 'detail' },
      amount: { $context: 'amount' },
    },
  },
};

// (`requests/forStay` used to live here and is CORE now — app/vex/stay.entries.
// The read moved when a core surface needed it: `desk.arrival` asks what an
// arriving guest has already requested, at every hotel, including ones that run
// no Opera. A core action reaching into a bundle's fingerprint space works right
// up until the bundle is not there, which is the failure the whole discovery
// model exists to avoid. Opera still WRITES the queue — `requests/raise`,
// `requests/decide` and the pending sheet below are all its own; it simply reads
// one stay's asks through core, the way it posts a charge through `folio/post`.)

export const requestsPending: SeedEntry = {
  fingerprint: 'requests/pending',
  intent: 'Pending stay requests at the property with guest, room and price',
  shape: [{ request_id: '', stay_id: '', kind: '', label: '', detail: '', amount: 0, amount_display: '', guest_name: '', room_number: '', asked_display: '' }],
  dsl: {
    from: ['stay_requests', 'stays', 'guests', 'rooms'],
    fields: [
      { field: 'stay_requests.id', as: 'request_id' },
      'stay_requests.stay_id',
      'stay_requests.kind',
      'stay_requests.label',
      'stay_requests.detail',
      'stay_requests.amount',
      'stay_requests.created_at',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
    ],
    // `requestId` AIMS THE QUEUE, so this surface can be opened on one guest's
    // ask rather than only on everybody's. Callers wanting the whole thing pass
    // '%' — the same optional-filter idiom the movements read uses for a name
    // search, and one entry rather than two that drift apart.
    filter: {
      and: [{ eq: ['stay_requests.status', 'pending'] }, { like: ['stay_requests.id', { $context: 'requestId' }] }],
    },
    sort: [{ field: 'stay_requests.created_at', dir: 'asc' }],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        request_id: { $get: { from: { $var: 'r' }, path: ['request_id'] } },
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        label: { $get: { from: { $var: 'r' }, path: ['label'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'] } },
        amount: { $get: { from: { $var: 'r' }, path: ['amount'] } },
        // The price the ask carried, spelled here so the clerk sees what a
        // yes costs. A free option says so in words rather than "€0" — the
        // desk approves comps too, and a zero is not a price.
        amount_display: {
          $case: {
            branches: [{ when: { $get: { from: { $var: 'r' }, path: ['amount'] } }, then: money({ $get: { from: { $var: 'r' }, path: ['amount'] } }) }],
            else: 'No charge',
          },
        },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        asked_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

export const requestDecide: SeedMutation = {
  fingerprint: 'requests/decide',
  intent: 'Answer a stay request — approved or declined',
  mutation: {
    op: 'update',
    table: 'stay_requests',
    set: { status: { $context: 'status' } },
    where: { eq: ['stay_requests.id', { $context: 'id' }] },
  },
};

// ─── folio adjustment ────────────────────────────────────────
// Opera owns the bill; our folio_lines is a projection of it. So the void
// happens THERE first (the action calls /integrations/con_opera/folio/void)
// and this only records the answer on the mirror. The row survives — a folio
// remembers what was reversed — and every read that shows or totals a stay
// already filters `voided_at`.
export const folioVoid: SeedMutation = {
  fingerprint: 'opera/folioVoid',
  intent: 'Mark a folio line reversed after Opera accepted the adjustment',
  mutation: {
    op: 'update',
    table: 'folio_lines',
    // `at` is the ambient date the engine injects ($.today), the same way
    // resolving an issue stamps its own — never a clock the browser sent.
    set: { voided_at: { $context: 'at' }, voided_by: { $context: 'reason' } },
    where: { eq: ['folio_lines.id', { $context: 'lineId' }] },
  },
};

// ─── transfers ───────────────────────────────────────────────
// Opera holds the car contract, so the booking goes THERE and only its answer
// becomes our mirror row — the same order as the spa and the folio, and for the
// same reason: a service that did not answer must leave no row claiming it did.
//
// The READS are core (`transfers/forStay`, `transfers/sheet`), because Mews
// books cars too and "what is booked on this stay" has one answer whichever
// fleet turns up. Only the write is ours.
export const transferRecord: SeedMutation = {
  fingerprint: 'opera/transferRecord',
  intent: 'Record a transfer on the mirror after Opera confirmed the car',
  mutation: {
    op: 'insert',
    table: 'transfers',
    values: {
      stay_id: { $context: 'stayId' },
      direction: { $context: 'direction' },
      pickup_on: { $context: 'pickupOn' },
      pickup_at: { $context: 'pickupAt' },
      destination: { $context: 'destination' },
      vehicle: { $context: 'vehicle' },
      confirmation: { $context: 'confirmation' },
    },
  },
};

// (The stay picker the upsell and set-call surfaces open with is CORE now —
// `stays/pick` in app/vex/stay.entries.ts — because every crew half that acts
// for a guest starts there, whichever connector shipped it.)
