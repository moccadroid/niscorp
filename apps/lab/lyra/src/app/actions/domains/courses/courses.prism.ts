import { courseCreate, courseRestore, courseRetire, courseRoster, courseUpdate, coursesList } from '@lyra/app/vex/course.entries';
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
export const courseCreatePrism = { fingerprint: courseCreate.fingerprint, context: fields };
export const courseUpdatePrism = { fingerprint: courseUpdate.fingerprint, context: { courseId: { $ref: '$.courseId' }, ...fields } };
export const courseRetirePrism = { fingerprint: courseRetire.fingerprint, context: { courseId: { $ref: '$.courseId' } } };
export const courseRestorePrism = { fingerprint: courseRestore.fingerprint, context: { courseId: { $ref: '$.courseId' } } };
