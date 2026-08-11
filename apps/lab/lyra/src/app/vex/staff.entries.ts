import type { CacheEntry, MutationEntry } from './index';

// WHO WORKS HERE, AND AS WHAT.
//
// This is the ACL surface, and it is worth being precise about what it does:
// it writes a row in `staff`. It does not grant anything. The charter decides
// what a role may hold, `assignments` maps a principal to their role, and moss
// resolves the pair per principal — so changing this column changes somebody's
// entire application, and it does it by changing one word in a database.
//
// Nothing here can invent a permission. A role that is not in the charter
// resolves to nothing, and a role that is resolves to exactly what the charter
// already said. That is the property worth having: the most dangerous screen in
// the product cannot express anything the policy document does not.

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

// A ROLE IS AN IDENTITY, SO IT WEARS A HUE.
//
// This used to be `owner → alert`, defended in a comment as "the row somebody
// should look twice at". It rendered the person who owns the business in the
// same red the app uses for a failed payment and a cancelled class, on their
// own staff roster — and `manager → warm` put the second-most-senior person in
// a warning colour. Seniority is not a state of alarm.
//
// Four roles, four hues, ordered from senior to junior so the ladder is
// legible without any of them claiming to be a problem.
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
    // THE AUTOMATION PRINCIPAL IS NOT STAFF YOU CAN PROMOTE.
    //
    // It is a staff row because that is what puts it under the charter — but it
    // turned up on the roster with four role buttons beside it, so a mis-tap
    // could have made a studio's nightly job an owner. It is not a person and
    // it has no business on a screen about people.
    //
    // SEARCHABLE, like the roll and the follow-up list. A roster is small today
    // and the rule does not depend on that: if a screen lists humans, you can
    // type a name. Nothing about staff makes it the exception.
    filter: {
      and: [
        { neq: ['staff.role', 'automation'] },
        { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] },
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
        // A STATE IS AN ADJECTIVE, A BUTTON IS AN IMPERATIVE. 'Off staff' was both:
        // the badge said it and so did the button beside it. One is what somebody
        // IS, the other is what you DO to them.
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
//
// The one write in this application that changes what somebody else can DO.
// It is deliberately narrow: it sets a role on an existing staff row, and it
// can set nothing else. Creating staff, or removing them, are separate verbs
// with separate grants.

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

// Taking somebody off staff keeps the row: who taught what, last term, is a
// question a studio asks — and a deleted row answers it with silence. It also
// means their sessions keep an instructor.
export const staffDeactivate: MutationEntry = {
  fingerprint: 'staff/deactivate',
  intent: 'Take somebody off staff, keeping the record',
  mutation: {
    op: 'update',
    table: 'staff',
    set: { active: false },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

export const staffReactivate: MutationEntry = {
  fingerprint: 'staff/reactivate',
  intent: 'Put somebody back on staff',
  mutation: {
    op: 'update',
    table: 'staff',
    set: { active: true },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

// Putting somebody ON staff. The person must already exist — the fn that
// wraps this creates them first if we have never seen the address, exactly as
// signing a member up does, and for the same reason: a human is not a studio's
// property, and the row that binds them here is this one.
//
// `id` is supplied because the caller needs to know it; `studio_id` is not,
// because the caller must never choose it. The engine stamps that.
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
