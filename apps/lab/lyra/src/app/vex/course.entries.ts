import type { CacheEntry, MutationEntry } from './index';
import { dateText, priceText } from '@lyra/app/prisms/format.prism';

// COURSES — the dated thing a program is not.
//
// A program is a taxonomy: "Vinyasa Flow", a stream that runs indefinitely,
// carrying a name and a colour. A course is a block somebody joins: it starts,
// it ends, it holds a fixed number of people, and it has a price. The first
// version of this schema had only the first, so the second kept turning up in
// blurbs — "six weeks, runs every term" — where no query can reach it.

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

// What a studio is running. Places left is computed here rather than in a
// layout, because a layout that did arithmetic would be a layout making a
// decision about what "full" means.
export const coursesList: CacheEntry = {
  fingerprint: 'courses/list',
  intent: 'The courses this studio runs, with how full each one is',
  shape: [{ course_id: '', name: '', blurb: '', program_name: '', tone: '', dates_display: '', price_display: '', places_display: '', full: false, active: false, starts_on: '', ends_on: '', capacity: 0, price_cents: 0, program_id: '' }],
  dsl: {
    from: ['courses', 'programs'],
    fields: [
      { field: 'courses.id', as: 'course_id' },
      'courses.name',
      'courses.blurb',
      'courses.starts_on',
      'courses.ends_on',
      'courses.capacity',
      'courses.enrolled_count',
      'courses.price_cents',
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
        // Both halves, as everywhere: the raw columns so an edit form can
        // prefill from the row it was clicked on, the display strings so no
        // layout has to know what a cent or a date is.
        starts_on: row('starts_on'),
        ends_on: row('ends_on'),
        capacity: row('capacity'),
        price_cents: row('price_cents'),
        active: row('active'),
        dates_display: { $join: { parts: [dateText(row('starts_on')), ' – ', dateText(row('ends_on'))], sep: '' } },
        price_display: priceText(row('price_cents')),
        places_display: { $join: { parts: [row('enrolled_count'), ' of ', row('capacity')], sep: '' } },
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
    from: ['enrolments', 'memberships', 'people'],
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

export const courseCreate: MutationEntry = {
  fingerprint: 'courses/create',
  intent: 'Put a course on sale',
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
      price_cents: { $context: 'priceCents' },
    },
  },
};

export const courseUpdate: MutationEntry = {
  fingerprint: 'courses/update',
  intent: 'Change a course',
  mutation: {
    op: 'update',
    table: 'courses',
    set: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      blurb: { $context: 'blurb' },
      starts_on: { $context: 'startsOn' },
      ends_on: { $context: 'endsOn' },
      capacity: { $context: 'capacity' },
      price_cents: { $context: 'priceCents' },
    },
    where: { eq: ['courses.id', { $context: 'courseId' }] },
  },
};

// Closed, never deleted — people are enrolled on it, and a studio asking "how
// did the autumn block go" needs the row to answer.
export const courseRetire: MutationEntry = {
  fingerprint: 'courses/retire',
  intent: 'Stop offering a course, keeping everybody on it',
  mutation: {
    op: 'update',
    table: 'courses',
    set: { active: false },
    where: { eq: ['courses.id', { $context: 'courseId' }] },
  },
};

export const courseRestore: MutationEntry = {
  fingerprint: 'courses/restore',
  intent: 'Offer a course again',
  mutation: {
    op: 'update',
    table: 'courses',
    set: { active: true },
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

// ONE client value. `membership_id` and `studio_id` come from scope; the
// membership, the course name and its dates are derived in the trigger.
export const joinCourse: MutationEntry = {
  fingerprint: 'me/join-course',
  // Personal whoever asks — see `me/cancel`.
  reach: 'personal',
  intent: 'Join a course',
  // One value; the membership and the studio are the rung's.
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
//
// A front desk enrols somebody at the counter, the same way it books a class.
// It works from the MEMBERSHIP it is looking at; the person is derived in the
// database (see `derive_enrolment_person`), so a request cannot pair one
// member's membership with another's name.

export const enrolmentsForMember: CacheEntry = {
  fingerprint: 'enrolments/for-member',
  intent: 'Which courses one membership at this studio is on',
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
        { eq: ['enrolments.membership_id', { $context: 'membershipId' }] },
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

// TWO client values, and neither is a person: the course, and the membership
// already on screen. `studio_id` is stamped by the engine and `membership_id` is
// derived by the database, so there is no field here naming a human.
export const enrolMember: MutationEntry = {
  fingerprint: 'enrolments/create',
  intent: 'Put a member on a course from the desk',
  mutation: {
    op: 'insert',
    table: 'enrolments',
    values: { course_id: { $context: 'courseId' }, membership_id: { $context: 'membershipId' } },
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
