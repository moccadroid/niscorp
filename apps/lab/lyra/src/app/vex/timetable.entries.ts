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
    // NO join to people, and the reason is a real limitation worth naming.
    // `instructor_id` is nullable so vex LEFT-joins staff — but `staff.person_id`
    // is NOT NULL, so people INNER-joins to staff, and the chain drops every
    // slot with no teacher. That is exactly the row a manager is hunting for.
    //
    // The name is denormalised onto the row instead, kept true by a trigger
    // (schema.ts). Joining it afterwards in the action was the other candidate
    // and does not work: a trigger's `set` resolves bindings but never
    // evaluates Prism ops.
    // A COURSE IS NOT A SECOND KIND OF SCHEDULE, so this does not need a
    // second read. `course_id` is NULLABLE, which makes vex LEFT-join it — an
    // ongoing slot keeps its row with the course columns empty, and that
    // emptiness IS the difference between the two. Two screens listing the same
    // table with different filters is what made them look unrelated.
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
      // HOW FULL THE BLOCK IS. It rode on the Courses screen, which is gone —
      // and going with it left the merged list able to say a course exists and
      // what it costs but not whether anybody had bought it, which is the one
      // number a manager scans the list for. NULL on an ongoing slot, because
      // only a block has a cohort.
      { field: 'courses.enrolled_count', as: 'course_enrolled' },
    ],
    // GROUPED BEFORE ORDERED, because the screen groups on what a row RUNS as
    // — every-week slots together, each dated block under its own dates. A
    // list groups by breaking where a value changes, so an unsorted one
    // interleaves: "Every week / Thu 13 Aug / Every week" down the page. The
    // grouping is a rendering decision and the ORDER is a query decision, and
    // this is the query keeping its half of that bargain.
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
        // Read straight off the row. A slot nobody teaches says "Unassigned",
        // which is the column's own default — a state a manager needs to see,
        // not a blank cell they have to interpret.
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
        price_display: { $case: { branches: [{ when: row('course_id'), then: priceText(row('course_price')) }], else: '' } },
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

// Who can be put in front of a class. Instructors, managers and owners teach;
// the front desk does not. That is a studio fact rather than a permission one,
// which is why it is a filter here and not a charter grant.
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
//
// Every authored table mints its own keys: the grammar sets literals and
//  values and cannot generate or read back an id, so a database
// default is the only place a primary key can honestly come from.

export const templateCreate: MutationEntry = {
  fingerprint: 'templates/create',
  intent: 'Add a weekly class slot',
  mutation: {
    op: 'insert',
    table: 'class_templates',
    // No id — the column defaults to `gen_random_uuid()`. Every authored table
    // in this schema mints its own keys now: the grammar cannot generate one,
    // and a client-invented primary key is a collision waiting to happen.
    values: {
      program_id: { $context: 'programId' },
      name: { $context: 'name' },
      weekday: { $context: 'weekday' },
      starts_at: { $context: 'startsAt' },
      duration_mins: { $context: 'durationMins' },
      capacity: { $context: 'capacity' },
      instructor_id: { $context: 'instructorId' },
      // A SLOT CAN BELONG TO A COURSE.
      //
      // These three are what make a bounded block possible: the course it is
      // part of, and the window session generation is allowed to fill. Without
      // them a course had dates and no classes — it told you the block ran for
      // three weeks and never said when to turn up.
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

// Retiring a slot, not deleting it. Sessions already generated from it keep
// their rows and their bookings — a studio that drops Tuesday next term still
// has last term's attendance.
export const templateRetire: MutationEntry = {
  fingerprint: 'templates/retire',
  intent: 'Take a weekly slot out of the grid, keeping its history',
  mutation: {
    op: 'update',
    table: 'class_templates',
    set: { active: false },
    where: { eq: ['class_templates.id', { $context: 'templateId' }] },
  },
};

export const templateRestore: MutationEntry = {
  fingerprint: 'templates/restore',
  intent: 'Put a retired slot back in the grid',
  mutation: {
    op: 'update',
    table: 'class_templates',
    set: { active: true },
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

// A ONE-OFF — a workshop, a masterclass, a Saturday intensive.
//
// No template, so no recurrence: this is the only write in the application
// that makes a class_session directly. The schema always allowed it
// (`template_id` is nullable); nothing could create one, which was a missing
// screen rather than a missing concept.
//
// `week_key` and `hour_key` are absent on purpose — a trigger derives them, so
// a hand-written session groups in reports exactly like a generated one.
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
