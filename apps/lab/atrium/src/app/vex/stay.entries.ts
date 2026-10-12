import type { CacheEntry, MutationEntry } from './index';
import { dateText, money, stampText, stateText, stateTone, statusTone } from '@atrium/app/prisms/format.prism';

// A non-array `shape` tells vex to map the first row, so `$.result` is that
// row, or null when the query matched nothing. Prism's `$get` throws `E_TYPE`
// on null unless the node carries a `fallback`, and a read that finds no row
// would answer 500.
const rowText = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: '' } } });
const rowFlag = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: false } } });
// For a value handed to a formatter: the helpers in format.prism.ts branch on
// truthiness, so null takes their absent leg ('—', '€0').
const rowRaw = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: null } } });

export const stayCurrent: CacheEntry = {
  fingerprint: 'stay/current',
  intent: "The signed-in guest's current stay with room, property and connector",
  shape: {
    stay_id: '',
    property_id: '',
    guest_name: '',
    tier: '',
    property_name: '',
    city: '',
    accent: '',
    room_number: '',
    room_kind: '',
    arrival: '',
    arrival_display: '',
    departure: '',
    departure_display: '',
    state: '',
    state_text: '',
    nights: 0,
    rate_display: '',
    key_issued: false,
    checked_in: false,
    connector_name: '',
  },
  dsl: {
    from: ['stays', 'guests', 'rooms', 'properties', 'connectors'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'properties.id', as: 'property_id' },
      { field: 'guests.name', as: 'guest_name' },
      'guests.tier',
      { field: 'properties.name', as: 'property_name' },
      'properties.city',
      'properties.accent',
      { field: 'rooms.number', as: 'room_number' },
      { field: 'rooms.kind', as: 'room_kind' },
      'stays.arrival',
      'stays.departure',
      'stays.state',
      'stays.rate',
      'stays.key_issued',
      'stays.checked_in',
      { field: 'connectors.name', as: 'connector_name' },
    ],
    filter: { eq: ['stays.guest_id', { $context: 'guestId' }] },
    sort: [{ field: 'stays.arrival', dir: 'desc' }],
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        stay_id: rowText('stay_id'),
        property_id: rowText('property_id'),
        guest_name: rowText('guest_name'),
        tier: rowText('tier'),
        property_name: rowText('property_name'),
        city: rowText('city'),
        accent: rowText('accent'),
        room_number: rowText('room_number'),
        room_kind: rowText('room_kind'),
        arrival: rowText('arrival'),
        arrival_display: dateText(rowRaw('arrival')),
        departure: rowText('departure'),
        departure_display: dateText(rowRaw('departure')),
        state: rowText('state'),
        state_text: stateText(rowText('state')),
        // Guarded rather than given a fallback: `$dateDiff` takes two dates.
        nights: { $case: { branches: [{ when: rowRaw('arrival'), then: { $dateDiff: { unit: 'day', from: rowRaw('arrival'), to: rowRaw('departure') } } }], else: 0 } },
        rate_display: money(rowRaw('rate')),
        key_issued: rowFlag('key_issued'),
        checked_in: rowFlag('checked_in'),
        connector_name: rowText('connector_name'),
      },
    },
  },
};

export const stayById: CacheEntry = {
  fingerprint: 'stay/byId',
  intent: 'One stay by id with room, guest and property',
  shape: { stay_id: '', guest_name: '', tier: '', room_id: '', room_number: '', room_kind: '', arrival_display: '', departure_display: '', state_text: '', rate_display: '', key_issued: false, checked_in: false },
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'guests.name', as: 'guest_name' },
      'guests.tier',
      { field: 'stays.room_id', as: 'room_id' },
      { field: 'rooms.number', as: 'room_number' },
      { field: 'rooms.kind', as: 'room_kind' },
      'stays.arrival',
      'stays.departure',
      'stays.state',
      'stays.rate',
      'stays.key_issued',
      'stays.checked_in',
    ],
    filter: { eq: ['stays.id', { $context: 'stayId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        stay_id: rowText('stay_id'),
        guest_name: rowText('guest_name'),
        tier: rowText('tier'),
        room_id: rowText('room_id'),
        room_number: rowText('room_number'),
        room_kind: rowText('room_kind'),
        arrival_display: dateText(rowRaw('arrival')),
        departure_display: dateText(rowRaw('departure')),
        state_text: stateText(rowText('state')),
        rate_display: money(rowRaw('rate')),
        key_issued: rowFlag('key_issued'),
        checked_in: rowFlag('checked_in'),
      },
    },
  },
};

export const staysMovements: CacheEntry = {
  fingerprint: 'stays/movements',
  intent: 'Stays at a property arriving, in house or departing, ordered by arrival',
  shape: [{ stay_id: '', guest_name: '', tier: '', room_number: '', arrival_display: '', departure_display: '', state: '', state_text: '', state_tone: '', checked_in: false, key_issued: false }],
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'guests.name', as: 'guest_name' },
      'guests.tier',
      { field: 'stays.room_id', as: 'room_id' },
      { field: 'rooms.number', as: 'room_number' },
      'stays.arrival',
      'stays.departure',
      'stays.state',
      'stays.checked_in',
      'stays.key_issued',
    ],
    filter: {
      and: [{ eq: ['stays.property_id', { $context: 'propertyId' }] }, { ilike: ['guests.name', { $context: 'q' }] }],
    },
    sort: [{ field: 'stays.arrival', dir: 'asc' }],
    limit: 60,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        tier: { $get: { from: { $var: 'r' }, path: ['tier'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        arrival_display: dateText({ $get: { from: { $var: 'r' }, path: ['arrival'] } }),
        departure_display: dateText({ $get: { from: { $var: 'r' }, path: ['departure'] } }),
        state: { $get: { from: { $var: 'r' }, path: ['state'] } },
        state_text: stateText({ $get: { from: { $var: 'r' }, path: ['state'] } }),
        state_tone: stateTone({ $get: { from: { $var: 'r' }, path: ['state'] } }),
        checked_in: { $get: { from: { $var: 'r' }, path: ['checked_in'] } },
        key_issued: { $get: { from: { $var: 'r' }, path: ['key_issued'] } },
      },
    },
  },
};

export const folioForStay: CacheEntry = {
  fingerprint: 'folio/forStay',
  intent: 'Charges posted to a stay, newest first (voided lines excluded)',
  shape: [{ line_id: '', description: '', amount: 0, amount_display: '', posted_display: '' }],
  dsl: {
    from: ['folio_lines'],
    fields: [{ field: 'folio_lines.id', as: 'line_id' }, 'folio_lines.description', 'folio_lines.amount', 'folio_lines.posted_at'],
    filter: { and: [{ eq: ['folio_lines.stay_id', { $context: 'stayId' }] }, { isNull: 'folio_lines.voided_at' }] },
    sort: [{ field: 'folio_lines.posted_at', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        line_id: { $get: { from: { $var: 'r' }, path: ['line_id'] } },
        description: { $get: { from: { $var: 'r' }, path: ['description'] } },
        amount: { $get: { from: { $var: 'r' }, path: ['amount'] } },
        amount_display: money({ $get: { from: { $var: 'r' }, path: ['amount'] } }),
        posted_display: stampText({ $get: { from: { $var: 'r' }, path: ['posted_at'] } }),
      },
    },
  },
};

export const folioTotal: CacheEntry = {
  fingerprint: 'folio/total',
  intent: 'Total posted to a stay (voided lines excluded)',
  shape: { total: 0, total_display: '' },
  dsl: {
    from: ['folio_lines'],
    aggregate: { total: { sum: 'folio_lines.amount' } },
    filter: { and: [{ eq: ['folio_lines.stay_id', { $context: 'stayId' }] }, { isNull: 'folio_lines.voided_at' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        total: { $get: { from: { $var: 'r' }, path: ['total'] } },
        total_display: money({ $get: { from: { $var: 'r' }, path: ['total'] } }),
      },
    },
  },
};

export const messagesFeed: CacheEntry = {
  fingerprint: 'messages/feed',
  intent: 'Recent messages across a property with guest and room, newest first',
  shape: [{ message_id: '', stay_id: '', guest_name: '', room_number: '', sender: '', sender_tone: '', body: '', sent_display: '' }],
  dsl: {
    from: ['messages', 'stays', 'guests', 'rooms'],
    fields: [
      { field: 'messages.id', as: 'message_id' },
      'messages.stay_id',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
      'messages.sender',
      'messages.body',
      'messages.sent_at',
    ],
    filter: { eq: ['messages.property_id', { $context: 'propertyId' }] },
    sort: [{ field: 'messages.sent_at', dir: 'desc' }],
    limit: 60,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        message_id: { $get: { from: { $var: 'r' }, path: ['message_id'] } },
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        sender: { $get: { from: { $var: 'r' }, path: ['sender'] } },
        sender_tone: { $case: { branches: [{ when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['sender'] } }, 'guest'] }, then: 'accent' }, { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['sender'] } }, 'assistant'] }, then: 'good' }], else: 'neutral' } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        sent_display: stampText({ $get: { from: { $var: 'r' }, path: ['sent_at'] } }),
      },
    },
  },
};

export const latestMessageForStay: CacheEntry = {
  fingerprint: 'messages/latest',
  intent: 'The newest message on a stay',
  shape: { message_id: '', sender: '', body: '', sent_display: '' },
  dsl: {
    from: ['messages'],
    fields: [{ field: 'messages.id', as: 'message_id' }, 'messages.sender', 'messages.body', 'messages.sent_at'],
    filter: { eq: ['messages.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'messages.sent_at', dir: 'desc' }],
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        message_id: { $get: { from: { $var: 'r' }, path: ['message_id'], fallback: { $const: '' } } },
        sender: { $get: { from: { $var: 'r' }, path: ['sender'], fallback: { $const: '' } } },
        body: { $get: { from: { $var: 'r' }, path: ['body'], fallback: { $const: '' } } },
        sent_display: stampText({ $get: { from: { $var: 'r' }, path: ['sent_at'], fallback: { $const: null } } }),
      },
    },
  },
};

export const messagesForStay: CacheEntry = {
  fingerprint: 'messages/forStay',
  intent: 'The message thread on a stay, oldest first',
  shape: [{ message_id: '', sender: '', body: '', sent_display: '' }],
  dsl: {
    from: ['messages'],
    fields: [{ field: 'messages.id', as: 'message_id' }, 'messages.sender', 'messages.body', 'messages.sent_at'],
    filter: { eq: ['messages.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'messages.sent_at', dir: 'asc' }],
    limit: 60,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        message_id: { $get: { from: { $var: 'r' }, path: ['message_id'] } },
        sender: { $get: { from: { $var: 'r' }, path: ['sender'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        sent_display: stampText({ $get: { from: { $var: 'r' }, path: ['sent_at'] } }),
      },
    },
  },
};

export const messageSend: MutationEntry = {
  fingerprint: 'messages/send',
  intent: 'Post a message onto a stay thread',
  mutation: {
    op: 'insert',
    table: 'messages',
    values: {
      stay_id: { $context: 'stayId' },
      sender: { $context: 'sender' },
      body: { $context: 'body' },
    },
  },
};

export const staySetKey: MutationEntry = {
  fingerprint: 'stays/setKey',
  intent: "Set a stay's mobile key flag",
  mutation: {
    op: 'update',
    table: 'stays',
    set: { key_issued: { $context: 'issued' } },
    where: { eq: ['stays.id', { $context: 'stayId' }] },
  },
};

export const staySetCheckedIn: MutationEntry = {
  fingerprint: 'stays/setCheckedIn',
  intent: 'Mark a stay checked in',
  mutation: {
    op: 'update',
    table: 'stays',
    set: { checked_in: { $context: 'checkedIn' }, state: { $context: 'state' } },
    where: { eq: ['stays.id', { $context: 'stayId' }] },
  },
};

export const staySetDeparted: MutationEntry = {
  fingerprint: 'stays/setDeparted',
  intent: 'Close a stay out — express checkout',
  mutation: {
    op: 'update',
    table: 'stays',
    set: { state: { $context: 'state' }, key_issued: { $context: 'issued' } },
    where: { eq: ['stays.id', { $context: 'stayId' }] },
  },
};

// Core, not bundle-owned: every bundle surface that acts for a guest starts by
// picking the stay.
export const staysPick: CacheEntry = {
  fingerprint: 'stays/pick',
  intent: 'In-house and arriving stays with guest and current room',
  shape: [{ stay_id: '', guest_name: '', room_number: '', state: '', state_text: '' }],
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [{ field: 'stays.id', as: 'stay_id' }, { field: 'guests.name', as: 'guest_name' }, { field: 'rooms.number', as: 'room_number' }, 'stays.state'],
    filter: { or: [{ eq: ['stays.state', 'in_house'] }, { eq: ['stays.state', 'arriving'] }] },
    sort: [{ field: 'stays.arrival', dir: 'asc' }],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        state: { $get: { from: { $var: 'r' }, path: ['state'] } },
        state_text: stateText({ $get: { from: { $var: 'r' }, path: ['state'] } }),
      },
    },
  },
};

export const requestsForStay: CacheEntry = {
  fingerprint: 'requests/forStay',
  intent: "One stay's requests with their answers",
  shape: [{ request_id: '', kind: '', label: '', detail: '', status: '', status_tone: '', asked_display: '' }],
  dsl: {
    from: ['stay_requests'],
    fields: [
      { field: 'stay_requests.id', as: 'request_id' },
      'stay_requests.kind',
      'stay_requests.label',
      'stay_requests.detail',
      'stay_requests.status',
      'stay_requests.created_at',
    ],
    filter: { eq: ['stay_requests.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'stay_requests.created_at', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        request_id: { $get: { from: { $var: 'r' }, path: ['request_id'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        label: { $get: { from: { $var: 'r' }, path: ['label'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'approved'] }, then: 'good' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'declined'] }, then: 'alert' },
            ],
            else: 'warn',
          },
        },
        asked_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

export const transfersForStay: CacheEntry = {
  fingerprint: 'transfers/forStay',
  intent: "One stay's airport transfers, soonest first",
  shape: [{ transfer_id: '', direction: '', pickup_on: '', pickup_at: '', destination: '', vehicle: '', confirmation: '', status: '', status_tone: '' }],
  dsl: {
    from: ['transfers'],
    fields: [
      { field: 'transfers.id', as: 'transfer_id' },
      'transfers.direction',
      'transfers.pickup_on',
      'transfers.pickup_at',
      'transfers.destination',
      'transfers.vehicle',
      'transfers.confirmation',
      'transfers.status',
    ],
    filter: { eq: ['transfers.stay_id', { $context: 'stayId' }] },
    sort: [
      { field: 'transfers.pickup_on', dir: 'asc' },
      { field: 'transfers.pickup_at', dir: 'asc' },
    ],
    limit: 10,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        transfer_id: { $get: { from: { $var: 'r' }, path: ['transfer_id'] } },
        direction: { $get: { from: { $var: 'r' }, path: ['direction'] } },
        pickup_on: dateText({ $get: { from: { $var: 'r' }, path: ['pickup_on'] } }),
        pickup_at: { $get: { from: { $var: 'r' }, path: ['pickup_at'] } },
        destination: { $get: { from: { $var: 'r' }, path: ['destination'] } },
        vehicle: { $get: { from: { $var: 'r' }, path: ['vehicle'] } },
        confirmation: { $get: { from: { $var: 'r' }, path: ['confirmation'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
      },
    },
  },
};

export const transfersSheet: CacheEntry = {
  fingerprint: 'transfers/sheet',
  intent: 'Booked transfers at the property in pickup order, with guest and room',
  shape: [{ transfer_id: '', pickup_on: '', pickup_at: '', destination: '', vehicle: '', direction: '', guest_name: '', room_number: '', stay_id: '' }],
  dsl: {
    from: ['transfers', 'stays', 'guests', 'rooms'],
    fields: [
      { field: 'transfers.id', as: 'transfer_id' },
      'transfers.pickup_on',
      'transfers.pickup_at',
      'transfers.destination',
      'transfers.vehicle',
      'transfers.direction',
      'transfers.stay_id',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: { eq: ['transfers.status', 'booked'] },
    sort: [
      { field: 'transfers.pickup_on', dir: 'asc' },
      { field: 'transfers.pickup_at', dir: 'asc' },
    ],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        transfer_id: { $get: { from: { $var: 'r' }, path: ['transfer_id'] } },
        pickup_on: dateText({ $get: { from: { $var: 'r' }, path: ['pickup_on'] } }),
        pickup_at: { $get: { from: { $var: 'r' }, path: ['pickup_at'] } },
        destination: { $get: { from: { $var: 'r' }, path: ['destination'] } },
        vehicle: { $get: { from: { $var: 'r' }, path: ['vehicle'] } },
        direction: { $get: { from: { $var: 'r' }, path: ['direction'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
      },
    },
  },
};

export const transferCancel: MutationEntry = {
  fingerprint: 'transfers/cancel',
  intent: 'Cancel a booked transfer',
  mutation: {
    op: 'update',
    table: 'transfers',
    set: { status: 'cancelled' },
    where: { eq: ['transfers.id', { $context: 'id' }] },
  },
};

export const folioPost: MutationEntry = {
  fingerprint: 'folio/post',
  intent: 'Post a line to the folio of a stay',
  mutation: {
    op: 'insert',
    table: 'folio_lines',
    values: {
      stay_id: { $context: 'stayId' },
      description: { $context: 'description' },
      amount: { $context: 'amount' },
    },
  },
};
