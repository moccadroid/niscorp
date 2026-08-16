import type { CacheEntry, MutationEntry } from './index';
import { dateText, pattern, priceText } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

export const coursesList: CacheEntry = {
  fingerprint: 'courses/list',
  intent: 'The courses this studio runs, with how full each one is',
  shape: [{ course_id: '', name: '', blurb: '', program_name: '', tone: '', dates_display: '', price_display: '', places_display: '', full: false, active: false, starts_on: '', ends_on: '', capacity: 0, price_cents: 0, offering_id: '', program_id: '' }],
  dsl: {
    // THE PRICE COMES FROM THE CATALOGUE, not from a column here — a block is a
    // dated thing with a roster, and what it costs is an offerings row like
    // every other price in the app. One join, and one answer to "what can
    // somebody pay for at this studio".
    from: ['courses', 'programs', 'offerings'],
    fields: [
      { field: 'courses.id', as: 'course_id' },
      'courses.name',
      'courses.blurb',
      'courses.starts_on',
      'courses.ends_on',
      'courses.capacity',
      'courses.enrolled_count',
      'courses.offering_id',
      { field: 'offerings.price_cents', as: 'price_cents' },
      'offerings.currency',
      'courses.active',
      'courses.program_id',
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'tone' },
    ],
    sort: [{ field: 'courses.starts_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        course_id: row('course_id'),
        name: row('name'),
        blurb: row('blurb'),
        program_name: row('program_name'),
        program_id: row('program_id'),
        tone: row('tone'),
        starts_on: row('starts_on'),
        ends_on: row('ends_on'),
        capacity: row('capacity'),
        price_cents: row('price_cents'),
        // Carried so the form can round-trip the price back onto the row that
        // holds it — the block names its price, and Save writes both.
        offering_id: row('offering_id'),
        active: row('active'),
        dates_display: { $join: { parts: [dateText(row('starts_on')), ' – ', dateText(row('ends_on'))], sep: '' } },
        price_display: priceText(row('price_cents'), row('currency')),
        places_display: pattern('{n} of {total}', { n: row('enrolled_count'), total: row('capacity') }),
        full: { $gte: [row('enrolled_count'), row('capacity')] },
      },
    },
  },
};

// Who is on a course. The cohort — the thing six separate bookings could not
// have told a studio.
export const courseRoster: CacheEntry = {
  fingerprint: 'courses/roster',
  intent: 'Who is enrolled on one of this studio’s courses',
  shape: [{ enrolment_id: '', person_name: '', email: '', status: '', enrolled_display: '' }],
  dsl: {
    from: ['enrolments', 'people'],
    fields: [
      { field: 'enrolments.id', as: 'enrolment_id' },
      'enrolments.status',
      'enrolments.enrolled_on',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    filter: {
      and: [
        { eq: ['enrolments.course_id', { $context: 'courseId' }] },
        { eq: ['enrolments.status', 'enrolled'] },
      ],
    },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        enrolment_id: row('enrolment_id'),
        person_name: row('person_name'),
        email: row('email'),
        status: row('status'),
        enrolled_display: dateText(row('enrolled_on')),
      },
    },
  },
};

// ─── running a course ────────────────────────────────────────

// THE BLOCK, POINTING AT ITS PRICE. The price is written first, by
// `offerings/create` — the same write every other price on the list goes
// through — and its id arrives here. Two calls rather than one artifact for the
// reason `people/enroll` and `childCreate` document: the statements of a
// multi-statement write are compiled together, and the second needs an id the
// first has not minted yet.
export const courseCreate: MutationEntry = {
  fingerprint: 'courses/create',
  intent: 'Put a course on sale, against a price already in the catalogue',
  mutation: {
    op: 'insert',
    table: 'courses',
    values: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      blurb: { $context: 'blurb' },
      starts_on: { $context: 'startsOn' },
      ends_on: { $context: 'endsOn' },
      capacity: { $context: 'capacity' },
      offering_id: { $context: 'offeringId' },
    },
  },
};

// EDITING ONE IS TWO STATEMENTS AND ONE ARTIFACT, because both ids are already
// known — unlike the create above. An array, so a save that renames the block
// but fails to reprice it is not a state this app can be left in.
//
// The NAME is written to both, deliberately: the block's name is what a roster
// prints and the catalogue's name is what a receipt prints, and a studio that
// renamed one and not the other would have two names for one thing.
export const courseUpdate: MutationEntry = {
  fingerprint: 'courses/update',
  intent: 'Change a course and the price it is sold at',
  mutation: [
    {
      op: 'update',
      table: 'offerings',
      set: { name: { $context: 'name' }, price_cents: { $context: 'priceCents' } },
      where: { eq: ['offerings.id', { $context: 'offeringId' }] },
    },
    {
      op: 'update',
      table: 'courses',
      set: {
        program_id: { $context: 'programId' },
        name: { $context: 'name' },
        blurb: { $context: 'blurb' },
        starts_on: { $context: 'startsOn' },
        ends_on: { $context: 'endsOn' },
        capacity: { $context: 'capacity' },
      },
      where: { eq: ['courses.id', { $context: 'courseId' }] },
    },
  ],
};

// Closed, never deleted — people are enrolled on it, and a studio asking "how
// did the autumn block go" needs the row to answer.
// One verb, the flag as its argument — see `templates/set-active`.
export const courseSetActive: MutationEntry = {
  fingerprint: 'courses/set-active',
  intent: 'Stop offering a course, or offer it again — everybody on it stays either way',
  mutation: {
    op: 'update',
    table: 'courses',
    set: { active: { $context: 'active' } },
    where: { eq: ['courses.id', { $context: 'courseId' }] },
  },
};

// ─── the member's side ───────────────────────────────────────

// What they are on. Denormalised by the mirror trigger, so no joins.
export const myEnrolments: CacheEntry = {
  fingerprint: 'me/enrolments',
  // Personal whoever asks — see `me/card`.
  reach: 'personal',
  intent: 'The courses the person asking has joined',
  shape: [{ enrolment_id: '', course_id: '', course_name: '', dates_display: '', status: '' }],
  // The real enrolment and the course it is on — what `member_enrolments` was
  // a copy of, denormalised course name and all.
  dsl: {
    from: ['enrolments', 'courses'],
    fields: [
      { field: 'enrolments.id', as: 'enrolment_id' },
      'enrolments.course_id',
      'enrolments.status',
      { field: 'courses.name', as: 'course_name' },
      'courses.starts_on',
      'courses.ends_on',
    ],
    filter: { eq: ['enrolments.status', 'enrolled'] },
    sort: [{ field: 'courses.starts_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        enrolment_id: row('enrolment_id'),
        course_id: row('course_id'),
        course_name: row('course_name'),
        status: row('status'),
        dates_display: { $join: { parts: [dateText(row('starts_on')), ' – ', dateText(row('ends_on'))], sep: '' } },
      },
    },
  },
};

// ONE client value. `person_id` and `studio_id` come from scope — "enrol
// somebody else" is not a request this grammar can phrase.
export const joinCourse: MutationEntry = {
  fingerprint: 'me/join-course',
  // Personal whoever asks — see `me/cancel`.
  reach: 'personal',
  intent: 'Join a course',
  // One value; the person and the studio are the rung's.
  mutation: {
    op: 'insert',
    table: 'enrolments',
    values: { course_id: { $context: 'courseId' } },
  },
};

export const leaveCourse: MutationEntry = {
  fingerprint: 'me/leave-course',
  // Personal whoever asks — see `me/cancel`.
  reach: 'personal',
  intent: 'Withdraw from a course',
  mutation: {
    op: 'update',
    table: 'enrolments',
    set: { status: 'withdrawn' },
    where: { eq: ['enrolments.id', { $context: 'enrolmentId' }] },
  },
};

// ─── the desk's side ─────────────────────────────────────────

export const enrolmentsForMember: CacheEntry = {
  fingerprint: 'enrolments/for-member',
  intent: 'Which courses one person at this studio is on',
  shape: [{ enrolment_id: '', course_id: '', course_name: '', dates_display: '', enrolled_display: '' }],
  dsl: {
    from: ['enrolments', 'courses'],
    fields: [
      { field: 'enrolments.id', as: 'enrolment_id' },
      'enrolments.enrolled_on',
      { field: 'courses.id', as: 'course_id' },
      { field: 'courses.name', as: 'course_name' },
      'courses.starts_on',
      'courses.ends_on',
    ],
    filter: {
      and: [
        { eq: ['enrolments.person_id', { $context: 'personId' }] },
        { eq: ['enrolments.status', 'enrolled'] },
      ],
    },
    sort: [{ field: 'courses.starts_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        enrolment_id: row('enrolment_id'),
        course_id: row('course_id'),
        course_name: row('course_name'),
        enrolled_display: dateText(row('enrolled_on')),
        dates_display: { $join: { parts: [dateText(row('starts_on')), ' – ', dateText(row('ends_on'))], sep: '' } },
      },
    },
  },
};

export const enrolMember: MutationEntry = {
  fingerprint: 'enrolments/create',
  intent: 'Put a person on a course from the desk',
  mutation: {
    op: 'insert',
    table: 'enrolments',
    values: { course_id: { $context: 'courseId' }, person_id: { $context: 'personId' } },
  },
};

export const withdrawMember: MutationEntry = {
  fingerprint: 'enrolments/withdraw',
  intent: 'Take a member off a course',
  mutation: {
    op: 'update',
    table: 'enrolments',
    set: { status: 'withdrawn' },
    where: { eq: ['enrolments.id', { $context: 'enrolmentId' }] },
  },
};
