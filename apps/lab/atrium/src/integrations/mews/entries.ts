import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { stampText, statusTone } from '@atrium/app/prisms/format.prism';

// `property_id` is stamped and matched by the tenant behaviors, so no entry
// here mentions it.

export const spaRecord: SeedMutation = {
  fingerprint: 'spa/record',
  intent: 'Mirror a spa booking the Mews connector confirmed',
  mutation: {
    op: 'insert',
    table: 'spa_bookings',
    values: {
      stay_id: { $context: 'stayId' },
      treatment: { $context: 'treatment' },
      slot_at: { $context: 'slotAt' },
      confirmation: { $context: 'confirmation' },
    },
  },
};

export const spaForStay: SeedEntry = {
  fingerprint: 'spa/forStay',
  intent: "One stay's spa bookings, newest first",
  shape: [{ booking_id: '', treatment: '', when_display: '', status: '', status_tone: '' }],
  dsl: {
    from: ['spa_bookings'],
    fields: [{ field: 'spa_bookings.id', as: 'booking_id' }, 'spa_bookings.treatment', 'spa_bookings.slot_at', 'spa_bookings.status'],
    filter: { eq: ['spa_bookings.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'spa_bookings.slot_at', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        booking_id: { $get: { from: { $var: 'r' }, path: ['booking_id'] } },
        treatment: { $get: { from: { $var: 'r' }, path: ['treatment'] } },
        when_display: stampText({ $get: { from: { $var: 'r' }, path: ['slot_at'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
      },
    },
  },
};

export const spaDiary: SeedEntry = {
  fingerprint: 'spa/diary',
  intent: "The property's spa diary with guest and room",
  shape: [{ booking_id: '', treatment: '', when_display: '', status: '', status_tone: '', guest_name: '', room_number: '' }],
  dsl: {
    from: ['spa_bookings', 'stays', 'guests', 'rooms'],
    fields: [
      { field: 'spa_bookings.id', as: 'booking_id' },
      'spa_bookings.treatment',
      'spa_bookings.slot_at',
      'spa_bookings.status',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
    ],
    sort: [{ field: 'spa_bookings.slot_at', dir: 'asc' }],
    limit: 30,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        booking_id: { $get: { from: { $var: 'r' }, path: ['booking_id'] } },
        treatment: { $get: { from: { $var: 'r' }, path: ['treatment'] } },
        when_display: stampText({ $get: { from: { $var: 'r' }, path: ['slot_at'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
      },
    },
  },
};

export const spaSetStatus: SeedMutation = {
  fingerprint: 'spa/setStatus',
  intent: "Move a spa booking's status",
  mutation: {
    op: 'update',
    table: 'spa_bookings',
    set: { status: { $context: 'status' } },
    where: { eq: ['spa_bookings.id', { $context: 'id' }] },
  },
};

export const spaByTreatment: SeedEntry = {
  fingerprint: 'spa/byTreatment',
  intent: 'Spa bookings counted by treatment and status',
  shape: [{ treatment: '', status: '', count: 0 }],
  dsl: {
    from: ['spa_bookings'],
    fields: ['spa_bookings.treatment', 'spa_bookings.status'],
    aggregate: { count: { count: '*' } },
    groupBy: ['spa_bookings.treatment', 'spa_bookings.status'],
    sort: [{ field: 'spa_bookings.treatment', dir: 'asc' }],
    limit: 40,
  },
};

// Its own fingerprint, not Opera's: two connectors implementing one capability
// each ship their own entries, and intake refuses a fingerprint another
// connector owns.
export const transferRecord: SeedMutation = {
  fingerprint: 'mews/transferRecord',
  intent: 'Record a transfer on the mirror after Mews confirmed the car',
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

export const folioVoid: SeedMutation = {
  fingerprint: 'mews/folioVoid',
  intent: 'Mark a folio line reversed after Mews accepted the void',
  mutation: {
    op: 'update',
    table: 'folio_lines',
    set: { voided_at: { $context: 'at' }, voided_by: { $context: 'reason' } },
    where: { eq: ['folio_lines.id', { $context: 'lineId' }] },
  },
};
