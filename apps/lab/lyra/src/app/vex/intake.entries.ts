import type { CacheEntry, MutationEntry } from './index';

export const personCreate: MutationEntry = {
  fingerprint: 'people/create',
  intent: 'Create a person — a human, not yet anybody at a studio',
  mutation: {
    op: 'insert',
    table: 'people',
    values: {
      id: { $context: 'personId' },
      email: { $context: 'email' },
      name: { $context: 'name' },
      phone: { $context: 'phone' },
    },
  },
};

export const studioPersonCreate: MutationEntry = {
  fingerprint: 'people/add',
  intent: 'Record that this studio knows a person — the anchor every relationship hangs off',
  mutation: {
    op: 'insert',
    table: 'studio_people',
    values: {
      id: { $context: 'studioPersonId' },
      person_id: { $context: 'personId' },
      // No status, deliberately. A prospect is this row holding nothing; a
      // member is this row plus a subscription; the milkman is this row plus a
      // contact tag. What they ARE is derived, never written. See standing.ts.
      //
      // A trial is a DATE, not a status: NULL means none, a date means the
      // free window closes on its own.
      trial_ends_on: { $context: 'trialEndsOn' },
      source: { $context: 'source' },
      notes: { $context: 'notes' },
    },
  },
};

// ── the whole signup, as ONE artifact ────────────────────────
//
// This used to be a server function: look the person up by email, mint ids,
// insert `people` only if absent, insert the anchor, translate the duplicate-
// key error. Every step existed because the grammar couldn't say it — and now
// it can. Statement 1 ensures the person (ON CONFLICT on the email identity —
// DO NOTHING, because statement 2 finds them by $lookup either way, fresh or
// returning). Statement 2 writes the anchor, idempotently: someone already on
// the roll conflicts on (studio_id, person_id) and returns no row — signing
// up an existing member is a no-op, not an error. Ids are DB-minted,
// `first_seen_on` is stamped by the studio-clock trigger, and the tenant
// column is pinned by scope. The reply says what happened by its row count:
// two rows = new person enrolled, one = known person enrolled (or fresh
// person already anchored — impossible), zero = already on the roll.
export const peopleEnroll: MutationEntry = {
  fingerprint: 'people/enroll',
  intent: 'Write a person down: ensure the human exists, then anchor them to this studio',
  mutation: [
    {
      op: 'insert',
      table: 'people',
      values: { email: { $context: 'email' }, name: { $context: 'name' }, phone: { $context: 'phone' } },
      onConflict: { target: ['email'] },
    },
    {
      op: 'insert',
      table: 'studio_people',
      values: {
        person_id: { $lookup: { from: 'people', field: 'id', where: { eq: ['people.email', { $context: 'email' }] } } },
        trial_ends_on: { $context: 'trialEndsOn' },
        source: { $context: 'source' },
        notes: { $context: 'notes' },
      },
      onConflict: { target: ['studio_id', 'person_id'] },
    },
  ],
};

// Somebody who already exists — a former member coming back — looked up by the
// address they would sign in with.
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
