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

// With no day ticked the fingerprint resolves to one no entry answers, so the
// server refuses the call before any SQL. The disabled button only covers
// people; this covers whatever else dispatches the event.
const anyDay = { $or: [{ $ref: '$.mon' }, { $ref: '$.tue' }, { $ref: '$.wed' }, { $ref: '$.thu' }, { $ref: '$.fri' }, { $ref: '$.sat' }, { $ref: '$.sun' }] };
export const courseCreatePrism = {
  fingerprint: { $case: { branches: [{ when: { $not: anyDay }, then: 'courses/refused-no-days' }], else: courseCreate.fingerprint } },
  context: { ...fields, offeringId: { $ref: '$.createdPrice.id' } },
};

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
export const courseRetirePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: false } };
export const courseRestorePrism = { fingerprint: courseSetActive.fingerprint, context: { courseId: { $ref: '$.courseId' }, active: true } };
