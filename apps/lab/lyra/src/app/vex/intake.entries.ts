import type { CacheEntry, MutationEntry } from './index';

// SIGNING SOMEBODY UP — the one write that creates two rows in two tables and
// has to link them.
//
// The grammar cannot do it alone, and it is worth being exact about why: values
// are literals or `$context`, so a mutation can neither generate a key nor read
// back one the database generated. Insert a person and the membership that must
// point at them has nothing to point with.
//
// The escape hatch D4 offers is a plain endpoint handler — an fn that opens the
// database and writes both rows. That works and gives up something real: the
// engine stops being the thing that enforces tenancy, and the fn's own care
// becomes the boundary.
//
// So the fn does LESS than that. It mints an id and calls these two entries
// over the session's own wire (server/functions/members.ts). The statements
// stay authored and server-side, the scope policy still applies to both, and
// the fn's entire contribution is a UUID and an order. Nothing about the
// tenancy guarantee moves.

export const personCreate: MutationEntry = {
  fingerprint: 'people/create',
  intent: 'Create a person — a human, not yet anybody at a studio',
  mutation: {
    op: 'insert',
    table: 'people',
    // The id IS supplied here, unlike everywhere else in this schema, because
    // the caller needs to know it to write the membership. It is minted
    // server-side by the fn, never by a browser.
    values: {
      id: { $context: 'personId' },
      email: { $context: 'email' },
      name: { $context: 'name' },
      phone: { $context: 'phone' },
    },
  },
};

// The membership. `studio_id` is absent because the engine stamps it, and
// `joined_on` is absent because the database dates it — so a desk signing
// somebody up supplies a name, an email and nothing else that could be wrong.
export const membershipCreate: MutationEntry = {
  fingerprint: 'memberships/create',
  intent: 'Give a person a membership at this studio',
  mutation: {
    op: 'insert',
    table: 'memberships',
    values: {
      id: { $context: 'membershipId' },
      person_id: { $context: 'personId' },
      // AN ENQUIRY IS THIS INSERT WITH ONE DIFFERENT WORD. `status: 'enquired'`
      // records somebody who asked; `'trialling'` records somebody who signed.
      // There is no second create path, which is what makes a conversion an
      // update rather than a retype.
      status: { $context: 'status' },
      source: { $context: 'source' },
      notes: { $context: 'notes' },
    },
  },
};

// Somebody who already exists — a former member coming back, or a person who
// trains at one studio and teaches at another once cross-studio identity lands.
// Looked up by the address they would sign in with.
export const personByEmail: CacheEntry = {
  fingerprint: 'people/byEmail',
  intent: 'Find a person by the email they sign in with',
  shape: { person_id: '', name: '', email: '' },
  dsl: {
    from: ['people'],
    fields: [{ field: 'people.id', as: 'person_id' }, 'people.name', 'people.email'],
    filter: { eq: ['people.email', { $context: 'email' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        person_id: { $get: { from: { $var: 'r' }, path: ['person_id'], fallback: { $const: '' } } },
        name: { $get: { from: { $var: 'r' }, path: ['name'], fallback: { $const: '' } } },
        email: { $get: { from: { $var: 'r' }, path: ['email'], fallback: { $const: '' } } },
      },
    },
  },
};
