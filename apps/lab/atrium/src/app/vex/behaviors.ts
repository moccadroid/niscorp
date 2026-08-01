import type { ScopeBehaviors } from '@niscorp/vex';

// Row behaviors — the tenant boundary, enforced engine-side.
//
// These compile (via vex's createScopePolicy) into the ScopePolicy the server
// applies AFTER a query is authored: a `match` becomes a WHERE the query author
// can neither see nor forge, ANDed onto whatever the query already had. The
// value a `to:` resolves against comes from the scope context the server
// injects, which — since moss grew the `scope` seam — includes `propertyId`,
// derived per principal from the directory (see app.ts).
//
// So `{ match: 'property_id', to: 'propertyId' }` on `stays` means every read of
// stays gains `AND stays.property_id = <the caller's property>`. A guest at The
// Lumen who hand-POSTs `context.propertyId = 'prop_marisol'` to the raw vex
// surface gets `property_id = 'prop_marisol' AND property_id = 'prop_lumen'` —
// empty. The boundary holds identically through the shell and through curl,
// because the scope value is server-side and unreferenceable by the request.
//
// WHAT IS SCOPED and what is not:
//
//   Scoped — the PII and operational tables: a principal only ever touches its
//   own hotel's guests, stays, rooms, staff, issues, tasks, folio and messages.
//   Uniform across guest, desk, service and ops, because every one of them is
//   single-tenant, so one rule serves them all with no per-role conflict.
//
//   NOT scoped — the estate and reference tables: connectors, capabilities,
//   surface_slots, properties, property_slots, live_capabilities. The VENDOR is
//   cross-tenant by definition (the rollout view reads every property), so
//   scoping these would break the one principal that must see across hotels.
//   None of them carries guest PII, and app reads are replay-only, so a
//   single-tenant principal has no fingerprint that dumps another hotel's rows.
//
// The residual, named honestly: property scope isolates hotel-from-hotel, not
// guest-from-guest WITHIN a hotel — a guest could still replay a stay/folio read
// with another stayId at their own property. Closing that needs a role-specific
// match on stays (`guest_id = userId` for guests only), which a per-table
// behaviors doc cannot carry; its home is the charter, which knows the role.
// That is a separate, larger change — tenant isolation is the boundary here.
const tenantRead = { read: [{ match: 'property_id', to: 'propertyId' }] };

// Writable tenant tables also PIN the property on write: `set` stamps
// property_id from scope on every insert/update (so a client cannot write a row
// into another hotel), and `match` filters which existing rows an update/delete
// may touch. The guest can therefore stop sending property_id at all — the
// engine supplies it, unforgeably.
const tenantWrite = {
  read: [{ match: 'property_id', to: 'propertyId' }],
  write: [
    { set: 'property_id', to: 'propertyId' },
    { match: 'property_id', to: 'propertyId' },
  ],
};

// The one PERSONAL table: turns are pinned to the caller, not just the tenant.
// Reads return only yours; writes stamp both your id and your hotel. This is
// the user-shaped rule the tenancy pass could not use anywhere else — the
// assistant's memory is exactly where it belongs.
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
  // Read like any other tenant table — the dispatch picker lists colleagues —
  // but a WRITE may only touch the caller's OWN row. `staff.id` IS the
  // principal, so matching it against `userId` means a person can change their
  // own settings and nobody else's, whatever a request body claims.
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
  // Staff-only rows, tenant-pinned like the rest. The charter is what keeps a
  // guest out of them — a behavior cannot express "this role and not that one" —
  // but the tenant rule still holds, so one hotel's notes and handovers can
  // never be read from another's session.
  stay_notes: tenantWrite,
  handovers: tenantWrite,
  property_capabilities: tenantWrite,
  // The bundle mirrors are tenant tables like any other — an integration's
  // actions arrive at runtime, but the boundary they write inside was
  // compiled here, before any of them existed.
  spa_bookings: tenantWrite,
  wake_calls: tenantWrite,
  transfers: tenantWrite,
  stay_requests: tenantWrite,
};
