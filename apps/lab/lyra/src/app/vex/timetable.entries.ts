import type { CacheEntry, MutationEntry } from './index';
import { dateText, priceText } from '@lyra/app/prisms/format.prism';

// The TIMETABLE — the rules a studio runs on, as opposed to the dated classes
// they produce. Managing this is a manager's job; reading it is everybody's.

const row = (name: string) => ({ $get: { from: { $var: 't' }, path: [name] } });

const weekdayText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 0] }, then: 'Sunday' },
      { when: { $eq: [value, 1] }, then: 'Monday' },
      { when: { $eq: [value, 2] }, then: 'Tuesday' },
      { when: { $eq: [value, 3] }, then: 'Wednesday' },
      { when: { $eq: [value, 4] }, then: 'Thursday' },
      { when: { $eq: [value, 5] }, then: 'Friday' },
    ],
    else: 'Saturday',
  },
});

// The weekly grid. The teacher's name rides on the row — see the DSL for why.
export const templatesList: CacheEntry = {
  fingerprint: 'templates/list',
  intent: "This studio's weekly class grid, with program and instructor",
  shape: [{ template_id: '', name: '', program_name: '', program_tone: '', weekday_display: '', starts_at: '', capacity: 0, instructor_name: '', active: false, course_id: '', is_course: false, runs_display: '', price_display: '', places_display: '' }],
  dsl: {
    from: ['class_templates', 'programs', 'courses'],
    fields: [
      { field: 'class_templates.id', as: 'template_id' },
      'class_templates.name',
      'class_templates.weekday',
      'class_templates.starts_at',
      'class_templates.duration_mins',
      'class_templates.capacity',
      'class_templates.active',
      'class_templates.program_id',
      'class_templates.instructor_id',
      'class_templates.instructor_name',
      { field: 'programs.name', as: 'program_name' },
      { field: 'programs.colour', as: 'program_tone' },
      'class_templates.course_id',
      'class_templates.starts_on',
      'class_templates.ends_on',
      { field: 'courses.price_cents', as: 'course_price' },
      { field: 'courses.currency', as: 'course_currency' },
      { field: 'courses.enrolled_count', as: 'course_enrolled' },
    ],
    sort: [
      { field: 'class_templates.course_id', dir: 'asc' },
      { field: 'class_templates.weekday', dir: 'asc' },
      { field: 'class_templates.starts_at', dir: 'asc' },
    ],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 't',
      body: {
        template_id: row('template_id'),
        name: row('name'),
        program_id: row('program_id'),
        program_name: row('program_name'),
        program_tone: row('program_tone'),
        weekday: row('weekday'),
        weekday_display: weekdayText(row('weekday')),
        starts_at: row('starts_at'),
        duration_mins: row('duration_mins'),
        capacity: row('capacity'),
        instructor_id: { $coalesce: [row('instructor_id'), ''] },
        instructor_name: row('instructor_name'),
        active: row('active'),
        // WHAT KIND OF THING THIS IS, in the row rather than in which screen
        // you happened to open. "Every week" or the dates it runs between.
        course_id: { $coalesce: [row('course_id'), ''] },
        is_course: { $case: { branches: [{ when: row('course_id'), then: true }], else: false } },
        // Blank on a weekly slot: "0 of 24" against a class that runs forever
        // is a number about nothing. A block is the only row with a cohort.
        places_display: {
          $case: {
            branches: [
              {
                when: row('course_id'),
                then: { $join: { parts: [row('course_enrolled'), ' of ', row('capacity')], sep: '' } },
              },
            ],
            else: '',
          },
        },
        runs_display: {
          $case: {
            branches: [{ when: row('course_id'), then: { $join: { parts: [dateText(row('starts_on')), ' – ', dateText(row('ends_on'))], sep: '' } } }],
            else: 'Every week',
          },
        },
        price_display: { $case: { branches: [{ when: row('course_id'), then: priceText(row('course_price'), row('course_currency')) }], else: '' } },
        state_label: { $case: { branches: [{ when: row('active'), then: 'On' }], else: 'Retired' } },
        state_tone: { $case: { branches: [{ when: row('active'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

export const templateById: CacheEntry = {
  fingerprint: 'templates/byId',
  intent: 'One class template at this studio',
  shape: { template_id: '', name: '', program_id: '', weekday: 0, starts_at: '', duration_mins: 60, capacity: 20, instructor_id: '', active: false },
  dsl: {
    from: ['class_templates'],
    fields: [
      { field: 'class_templates.id', as: 'template_id' },
      'class_templates.name',
      'class_templates.program_id',
      'class_templates.weekday',
      'class_templates.starts_at',
      'class_templates.duration_mins',
      'class_templates.capacity',
      'class_templates.instructor_id',
      'class_templates.active',
    ],
    filter: { eq: ['class_templates.id', { $context: 'templateId' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        template_id: one('template_id'),
        name: one('name'),
        program_id: one('program_id'),
        weekday: one('weekday', 1),
        starts_at: one('starts_at', '18:00'),
        duration_mins: one('duration_mins', 60),
        capacity: one('capacity', 20),
        instructor_id: one('instructor_id'),
        active: one('active', true),
      },
    },
  },
};

export const teachersList: CacheEntry = {
  fingerprint: 'staff/teachers',
  intent: 'Staff at this studio who can be assigned to a class',
  shape: [{ staff_id: '', person_name: '', role: '' }],
  dsl: {
    from: ['staff', 'people'],
    fields: [{ field: 'staff.id', as: 'staff_id' }, 'staff.role', { field: 'people.name', as: 'person_name' }],
    filter: { and: [{ eq: ['staff.active', true] }, { in: ['staff.role', ['owner', 'manager', 'instructor']] }] },
    sort: [{ field: 'people.name', dir: 'asc' }],
  },
  // Option shape on the way out, for the same reason as programs.
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 's',
      body: {
        staff_id: { $get: { from: { $var: 's' }, path: ['staff_id'] } },
        person_name: { $get: { from: { $var: 's' }, path: ['person_name'] } },
        role: { $get: { from: { $var: 's' }, path: ['role'] } },
        value: { $get: { from: { $var: 's' }, path: ['staff_id'] } },
        label: { $get: { from: { $var: 's' }, path: ['person_name'] } },
      },
    },
  },
};

// ─── writes ──────────────────────────────────────────────────

export const templateCreate: MutationEntry = {
  fingerprint: 'templates/create',
  intent: 'Add a weekly class slot',
  mutation: {
    op: 'insert',
    table: 'class_templates',
    values: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      weekday: { $context: 'weekday' },
      starts_at: { $context: 'startsAt' },
      duration_mins: { $context: 'durationMins' },
      capacity: { $context: 'capacity' },
      instructor_id: { $context: 'instructorId' },
      course_id: { $context: 'courseId' },
      starts_on: { $context: 'startsOn' },
      ends_on: { $context: 'endsOn' },
    },
  },
};

// One statement for however many days a course meets on — `slots` is an array
// of `{ weekday }` objects and every other column is constant across rows.
// This is the loop that used to live in a server function, now authored:
// `INSERT … SELECT … FROM jsonb_array_elements($slots)`.
export const templatesCreateEach: MutationEntry = {
  fingerprint: 'templates/createEach',
  intent: 'Add a weekly class slot for each chosen day — a course’s whole meeting pattern in one write',
  mutation: {
    op: 'insertEach',
    table: 'class_templates',
    items: { $context: 'slots' },
    values: {
      weekday: { $item: 'weekday' },
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      starts_at: { $context: 'startsAt' },
      duration_mins: { $context: 'durationMins' },
      capacity: { $context: 'capacity' },
      instructor_id: { $context: 'instructorId' },
      course_id: { $context: 'courseId' },
      starts_on: { $context: 'startsOn' },
      ends_on: { $context: 'endsOn' },
    },
  },
};

export const templateUpdate: MutationEntry = {
  fingerprint: 'templates/update',
  intent: 'Change a weekly class slot',
  mutation: {
    op: 'update',
    table: 'class_templates',
    set: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      weekday: { $context: 'weekday' },
      starts_at: { $context: 'startsAt' },
      duration_mins: { $context: 'durationMins' },
      capacity: { $context: 'capacity' },
      instructor_id: { $context: 'instructorId' },
    },
    where: { eq: ['class_templates.id', { $context: 'templateId' }] },
  },
};

// RETIRE AND RESTORE ARE ONE VERB. They were two entries writing `false` and
// `true` into the same column of the same row — the flag is the only thing
// that differed, so the flag is the argument.
//
// This gives up nothing. A boolean column bounds the value completely (there
// is no third thing to write), and charter grants are table.operation
// (`class_templates.write.update`), so both fingerprints already sat behind
// one identical permission — splitting them never bought a narrower grant.
export const templateSetActive: MutationEntry = {
  fingerprint: 'templates/set-active',
  intent: 'Take a weekly slot out of the grid, or put it back — its history is kept either way',
  mutation: {
    op: 'update',
    table: 'class_templates',
    set: { active: { $context: 'active' } },
    where: { eq: ['class_templates.id', { $context: 'templateId' }] },
  },
};

// Calling off ONE dated class. The slot survives; only this occurrence is off,
// and its bookings stay so the desk can see who to tell.
export const sessionCancel: MutationEntry = {
  fingerprint: 'sessions/cancel',
  intent: 'Cancel one dated class',
  mutation: {
    op: 'update',
    table: 'class_sessions',
    set: { status: 'cancelled' },
    where: { eq: ['class_sessions.id', { $context: 'sessionId' }] },
  },
};

export const sessionRestore: MutationEntry = {
  fingerprint: 'sessions/restore',
  intent: 'Put a cancelled class back on',
  mutation: {
    op: 'update',
    table: 'class_sessions',
    set: { status: 'scheduled' },
    where: { eq: ['class_sessions.id', { $context: 'sessionId' }] },
  },
};

// ─── programs ────────────────────────────────────────────────

export const programCreate: MutationEntry = {
  fingerprint: 'programs/create',
  intent: 'Add a program',
  mutation: {
    op: 'insert',
    table: 'programs',
    values: { name: { $context: 'name' }, blurb: { $context: 'blurb' }, colour: { $context: 'colour' } },
  },
};

export const programUpdate: MutationEntry = {
  fingerprint: 'programs/update',
  intent: 'Change a program',
  mutation: {
    op: 'update',
    table: 'programs',
    set: { name: { $context: 'name' }, blurb: { $context: 'blurb' }, colour: { $context: 'colour' } },
    where: { eq: ['programs.id', { $context: 'programId' }] },
  },
};

export const eventCreate: MutationEntry = {
  fingerprint: 'sessions/create-event',
  intent: 'Put a one-off class on the calendar',
  mutation: {
    op: 'insert',
    table: 'class_sessions',
    values: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      held_on: { $context: 'heldOn' },
      starts_at: { $context: 'startsAt' },
      duration_mins: { $context: 'durationMins' },
      capacity: { $context: 'capacity' },
      instructor_id: { $context: 'instructorId' },
    },
  },
};
