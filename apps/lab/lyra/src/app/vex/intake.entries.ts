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
      trial_ends_on: { $context: 'trialEndsOn' },
      source: { $context: 'source' },
      notes: { $context: 'notes' },
    },
  },
};

// The reply's row count says what happened: two = a new person enrolled,
// one = a known person enrolled, zero = already on the roll.
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

// Not `people/enroll`: that is keyed on email, and a child has none. Two calls,
// this and `people/attach-child` with the id minted here: one statement of a
// write cannot refer to another's row. Between them the child is in no reach.
export const childCreate: MutationEntry = {
  fingerprint: 'people/create-child',
  intent: 'Create a child: a person with a name, an age and deliberately no way in',
  mutation: {
    op: 'insert',
    table: 'people',
    values: {
      name: { $context: 'name' },
      born_on: { $context: 'bornOn' },
      // `email` is left out so the column takes NULL: the UNIQUE index treats
      // NULLs as distinct and empty strings as equal, so '' would allow one child.
    },
  },
};

export const childAttach: MutationEntry = {
  fingerprint: 'people/attach-child',
  intent: 'Put a child on the roll and say who may act for them — both, or the child is nobody’s',
  mutation: [
    {
      op: 'insert',
      table: 'studio_people',
      values: {
        person_id: { $context: 'childPersonId' },
        source: { $context: 'source' },
        notes: { $context: 'notes' },
      },
      onConflict: { target: ['studio_id', 'person_id'] },
    },
    {
      // The guardian comes from context, not scope: the desk writes this and is
      // not the parent. The engine stamps the desk's own studio on the row, and
      // the member rung holds no insert on this table.
      op: 'insert',
      table: 'guardianships',
      values: {
        guardian_person_id: { $context: 'guardianPersonId' },
        child_person_id: { $context: 'childPersonId' },
      },
      onConflict: { target: ['studio_id', 'guardian_person_id', 'child_person_id'] },
    },
  ],
};

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
