import { courseCreate, courseSetActive, courseRoster, courseUpdate, coursesList } from '@lyra/app/vex/course.entries';
import { offeringCreate } from '@lyra/app/vex/reports.entries';
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
};

// THE BLOCK'S PRICE, WRITTEN THE WAY EVERY PRICE IS. Not a column on the course
// any more: one catalogue answers "what can somebody pay for here", and a block
// is one of the things on it. Every column that describes how a thing recurs or
// what it entitles somebody to is written as its own absence — a block is a
// name, a price, and a set of dates that live on the course.
export const coursePricePrism = {
  fingerprint: offeringCreate.fingerprint,
  context: {
    name: { $ref: '$.name' },
    kind: 'course',
    priceCents: { $ref: '$.priceCents' },
    interval: 'month',
    intervalCount: 1,
    classAllowance: null,
    minimumTermMonths: 0,
    noticeDays: 0,
    credits: null,
    validDays: null,
    joiningFeeId: null,
  },
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
  // The price row the call before this one just wrote. Chained rather than
  // carried inside one artifact, for the reason `courses/create` states.
  context: { ...fields, offeringId: { $ref: '$.createdPrice.id' } },
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
export const courseUpdatePrism = {
  fingerprint: courseUpdate.fingerprint,
  context: { courseId: { $ref: '$.courseId' }, offeringId: { $ref: '$.offeringId' }, priceCents: { $ref: '$.priceCents' }, ...fields },
};
// One write either way — see `plans.prism`. Only the retiring half has a
// control today; the other direction is a prism away rather than an entry away.
export const courseRetirePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: false } };
export const courseRestorePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: true } };
