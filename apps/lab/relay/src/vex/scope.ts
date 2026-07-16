import type { ScopeBehaviors } from '@relay/charter';

// Row BEHAVIORS — NOT access control. Whether a read/write phase EXISTS for a
// principal is the charter's decision (its `data` section, compiled to a vex
// ScopePolicy by charter/policy.ts). This file only says what a GRANTED phase
// DOES: which rows it filters, pins, or stamps. Listing a table here grants
// nothing — an unlisted-but-granted phase just runs with no rules.
//
// Applied by the vex engine AFTER the DSL is authored, so a generated or
// injected request can't reference, forge, or omit them. `set` writes a
// column from scope on EVERY write (insert and update — delete writes no
// columns); `match` filters reads and pins update/delete rows. (Whether
// these are "just my rows" or a tenant boundary is a policy choice above;
// the mechanism is the same.)
export const scopeBehaviors: ScopeBehaviors = {
  // Personal — reads filtered and writes pinned to the assignee; every write
  // sets the assignee from scope (idempotent under the pin: your rows are
  // already yours). CRM records (companies/contacts/deals) carry NO
  // behaviors: team-shared, and ownership is never writer-derived — a `set`
  // on owner_id would reassign the owner on every edit. Reference tables and
  // activities carry none either: a granted read runs unfiltered (and
  // nothing grants their write).
  tasks: {
    read: [{ match: 'assignee_id', to: 'userId' }],
    write: [
      { set: 'assignee_id', to: 'userId' },
      { match: 'assignee_id', to: 'userId' },
    ],
  },
};

// The tables the schema defines — the `data` universe is TABLES × verbs.
// Derived by hand from the DDL (schema.ts) for the client proof; the server
// derives it from vex introspection. The single source charter's data
// section resolves against and the engine's full policy is built from.
export const TABLES = [
  'users',
  'companies',
  'contacts',
  'pipelines',
  'stages',
  'deals',
  'products',
  'deal_products',
  'activities',
  'tasks',
  'lists',
  'list_members',
  'actions',
] as const;
