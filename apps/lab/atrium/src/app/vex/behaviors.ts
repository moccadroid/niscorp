import type { ScopeBehaviors } from '@niscorp/vex';

// The estate and reference tables (connectors, capabilities, surface_slots,
// properties, property_slots, live_capabilities) are not scoped: the vendor
// reads across hotels, and none of them carries guest PII.
//
// Property scope isolates hotel from hotel, not guest from guest within a
// hotel: a guest can replay a stay or folio read with another stayId at their
// own property.
const tenantRead = { read: [{ match: 'property_id', to: 'propertyId' }] };

const tenantWrite = {
  read: [{ match: 'property_id', to: 'propertyId' }],
  write: [
    { set: 'property_id', to: 'propertyId' },
    { match: 'property_id', to: 'propertyId' },
  ],
};

const personal = {
  read: [
    { match: 'user_id', to: 'userId' },
    { match: 'property_id', to: 'propertyId' },
  ],
  write: [
    { set: 'user_id', to: 'userId' },
    { match: 'user_id', to: 'userId' },
    { set: 'property_id', to: 'propertyId' },
    { match: 'property_id', to: 'propertyId' },
  ],
};

export const scopeBehaviors: ScopeBehaviors = {
  assistant_turns: personal,
  assistant_runs: personal,
  seen_marks: personal,
  guests: tenantRead,
  rooms: tenantRead,
  // `staff.id` is the principal id: a write touches only the caller's row.
  staff: {
    read: [{ match: 'property_id', to: 'propertyId' }],
    write: [{ match: 'id', to: 'userId' }],
  },
  stay_groups: tenantRead,
  stays: tenantWrite,
  folio_lines: tenantWrite,
  messages: tenantWrite,
  issues: tenantWrite,
  tasks: tenantWrite,
  // The charter is what keeps a guest out of these: a behavior cannot express
  // "this role and not that one".
  stay_notes: tenantWrite,
  handovers: tenantWrite,
  property_capabilities: tenantWrite,
  spa_bookings: tenantWrite,
  wake_calls: tenantWrite,
  transfers: tenantWrite,
  stay_requests: tenantWrite,
};
