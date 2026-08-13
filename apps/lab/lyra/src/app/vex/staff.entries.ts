import type { CacheEntry, MutationEntry } from './index';

const row = (name: string) => ({ $get: { from: { $var: 's' }, path: [name] } });

const roleText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'owner'] }, then: 'Owner' },
      { when: { $eq: [value, 'manager'] }, then: 'Manager' },
      { when: { $eq: [value, 'instructor'] }, then: 'Instructor' },
      { when: { $eq: [value, 'desk'] }, then: 'Front desk' },
    ],
    else: value,
  },
});

// A role is an identity, so it wears a HUE rather than a status tone: seniority
// is not a state of alarm. Ordered senior to junior so the ladder is legible.
const roleHue = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'owner'] }, then: 'violet' },
      { when: { $eq: [value, 'manager'] }, then: 'indigo' },
      { when: { $eq: [value, 'instructor'] }, then: 'teal' },
      { when: { $eq: [value, 'desk'] }, then: 'sky' },
    ],
    else: 'stone',
  },
});

export const staffList: CacheEntry = {
  fingerprint: 'staff/list',
  intent: 'Everyone who works at this studio, and the role they hold',
  shape: [{ staff_id: '', person_id: '', person_name: '', email: '', role: '', role_display: '', role_hue: '', active: false }],
  dsl: {
    from: ['staff', 'people'],
    fields: [
      { field: 'staff.id', as: 'staff_id' },
      'staff.person_id',
      'staff.role',
      'staff.active',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    // The search is OPTIONAL: an empty box is not a search for '%%', it is the
    // absence of one, and the condition is not in the query at all. Before,
    // every caller had to know the wildcard sentinel to ask for "everyone".
    filter: {
      and: [
        { neq: ['staff.role', 'automation'] },
        {
          optional: {
            key: 'q',
            then: { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] },
          },
        },
      ],
    },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 's',
      body: {
        staff_id: row('staff_id'),
        person_id: row('person_id'),
        person_name: row('person_name'),
        email: row('email'),
        role: row('role'),
        role_display: roleText(row('role')),
        role_hue: roleHue(row('role')),
        active: row('active'),
        state_label: { $case: { branches: [{ when: row('active'), then: 'Active' }], else: 'Former' } },
        state_tone: { $case: { branches: [{ when: row('active'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

export const staffById: CacheEntry = {
  fingerprint: 'staff/byId',
  intent: 'One staff member at this studio',
  shape: { staff_id: '', person_name: '', email: '', role: '', role_display: '', active: false },
  dsl: {
    from: ['staff', 'people'],
    fields: [
      { field: 'staff.id', as: 'staff_id' },
      'staff.role',
      'staff.active',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    filter: { eq: ['staff.id', { $context: 'staffId' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        staff_id: one('staff_id'),
        person_name: one('person_name'),
        email: one('email'),
        role: one('role'),
        role_display: roleText(one('role')),
        active: one('active', false),
      },
    },
  },
};

// ─── writes ──────────────────────────────────────────────────

export const staffSetRole: MutationEntry = {
  fingerprint: 'staff/set-role',
  intent: "Change a staff member's role",
  mutation: {
    op: 'update',
    table: 'staff',
    set: { role: { $context: 'role' } },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

// One verb, the flag as its argument — see `templates/set-active`.
export const staffSetActive: MutationEntry = {
  fingerprint: 'staff/set-active',
  intent: 'Take somebody off staff, or put them back — the record is kept either way',
  mutation: {
    op: 'update',
    table: 'staff',
    set: { active: { $context: 'active' } },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

export const staffCreate: MutationEntry = {
  fingerprint: 'staff/create',
  intent: 'Put somebody on staff at this studio',
  mutation: {
    op: 'insert',
    table: 'staff',
    values: {
      id: { $context: 'staffId' },
      person_id: { $context: 'personId' },
      role: { $context: 'role' },
    },
  },
};

// The whole hire, as one artifact — the staff twin of `people/enroll` (see
// intake.entries.ts for the pattern). A member who starts teaching keeps the
// same person row: statement 1 conflicts on their email and steps aside,
// statement 2 finds them by it. Someone already on staff conflicts on
// (studio_id, person_id) and returns no row — a repeat hire is a no-op, and
// "change their role instead" lives on the roster where it belongs.
export const staffEnroll: MutationEntry = {
  fingerprint: 'staff/enroll',
  intent: 'Hire somebody: ensure the person exists, then put them on staff at this studio',
  mutation: [
    {
      op: 'insert',
      table: 'people',
      values: { email: { $context: 'email' }, name: { $context: 'name' }, phone: { $context: 'phone' } },
      onConflict: { target: ['email'] },
    },
    {
      op: 'insert',
      table: 'staff',
      values: {
        person_id: { $lookup: { from: 'people', field: 'id', where: { eq: ['people.email', { $context: 'email' }] } } },
        role: { $context: 'role' },
      },
      onConflict: { target: ['studio_id', 'person_id'] },
    },
  ],
};
