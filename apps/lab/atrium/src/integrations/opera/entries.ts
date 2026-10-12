import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { dateText, money, stampText, statusTone } from '@atrium/app/prisms/format.prism';

// `property_id` is stamped and matched by the tenant behaviors, so no entry
// here mentions it.

// The table default dates the call for tomorrow.
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
    // `requestId` narrows the queue to one request; a caller wanting all of it
    // passes '%'.
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

export const folioVoid: SeedMutation = {
  fingerprint: 'opera/folioVoid',
  intent: 'Mark a folio line reversed after Opera accepted the adjustment',
  mutation: {
    op: 'update',
    table: 'folio_lines',
    set: { voided_at: { $context: 'at' }, voided_by: { $context: 'reason' } },
    where: { eq: ['folio_lines.id', { $context: 'lineId' }] },
  },
};

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
