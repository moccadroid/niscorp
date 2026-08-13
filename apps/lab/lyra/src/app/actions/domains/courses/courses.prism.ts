import { courseCreate, courseSetActive, courseRoster, courseUpdate, coursesList } from '@lyra/app/vex/course.entries';
import { templatesCreateEach } from '@lyra/app/vex/timetable.entries';
import { programsList } from '@lyra/app/vex/schedule.entries';

export const coursesPrism = { fingerprint: coursesList.fingerprint, context: {} };
export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };
export const rosterPrism = { fingerprint: courseRoster.fingerprint, context: { courseId: { $ref: '$.rosterId' } } };

const fields = {
  programId: { $ref: '$.programId' },
  name: { $ref: '$.name' },
  blurb: { $ref: '$.blurb' },
  startsOn: { $ref: '$.startsOn' },
  endsOn: { $ref: '$.endsOn' },
  capacity: { $ref: '$.capacity' },
  priceCents: { $ref: '$.priceCents' },
};

// No `courseId` on create — the database mints it, as everywhere else.
//
// THE FINGERPRINT ITSELF IS THE GUARD: with no day ticked it resolves to a
// sentinel no entry answers, and replay-only refuses it before any SQL — the
// same trick the roll's lenses use, pointed at refusal instead of choice. The
// disabled button covers humans; this covers everything that dispatches
// events without looking at buttons. A course with no days has no classes,
// and it must not be creatable from ANY direction.
const anyDay = { $or: [{ $ref: '$.mon' }, { $ref: '$.tue' }, { $ref: '$.wed' }, { $ref: '$.thu' }, { $ref: '$.fri' }, { $ref: '$.sat' }, { $ref: '$.sun' }] };
export const courseCreatePrism = {
  fingerprint: { $case: { branches: [{ when: { $not: anyDay }, then: 'courses/refused-no-days' }], else: courseCreate.fingerprint } },
  context: fields,
};

// The ticked days as the rows `class_templates.weekday` holds — the loop that
// used to live in `courses.create` (a server function), now a $filter/$map
// over the form's toggles feeding ONE `insertEach` statement. `$.created` is
// the course row the create call just returned; the id chains the two calls.
const chosenDays = {
  $map: {
    over: {
      $filter: {
        over: [
          { on: { $ref: '$.sun' }, weekday: 0 },
          { on: { $ref: '$.mon' }, weekday: 1 },
          { on: { $ref: '$.tue' }, weekday: 2 },
          { on: { $ref: '$.wed' }, weekday: 3 },
          { on: { $ref: '$.thu' }, weekday: 4 },
          { on: { $ref: '$.fri' }, weekday: 5 },
          { on: { $ref: '$.sat' }, weekday: 6 },
        ],
        as: 'd',
        when: { $eq: [{ $get: { from: { $var: 'd' }, path: ['on'] } }, true] },
      },
    },
    as: 'd',
    body: { weekday: { $get: { from: { $var: 'd' }, path: ['weekday'] } } },
  },
};

export const courseSlotsPrism = {
  fingerprint: templatesCreateEach.fingerprint,
  context: {
    slots: chosenDays,
    courseId: { $ref: '$.created.id' },
    programId: { $ref: '$.programId' },
    name: { $ref: '$.name' },
    startsAt: { $ref: '$.startsAt' },
    durationMins: { $ref: '$.durationMins' },
    capacity: { $ref: '$.capacity' },
    instructorId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.instructorId' }, ''] }, then: null }], else: { $ref: '$.instructorId' } } },
    startsOn: { $ref: '$.startsOn' },
    endsOn: { $ref: '$.endsOn' },
  },
};
export const courseUpdatePrism = { fingerprint: courseUpdate.fingerprint, context: { courseId: { $ref: '$.courseId' }, ...fields } };
// One write either way — see `plans.prism`. Only the retiring half has a
// control today; the other direction is a prism away rather than an entry away.
export const courseRetirePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: false } };
export const courseRestorePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: true } };
