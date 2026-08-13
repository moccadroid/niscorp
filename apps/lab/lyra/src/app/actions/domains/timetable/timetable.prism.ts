import { eventCreate } from '@lyra/app/vex/timetable.entries';
import { programsList } from '@lyra/app/vex/schedule.entries';
import {
  programCreate,
  programUpdate,
  sessionCancel,
  sessionRestore,
  teachersList,
  templateById,
  templateCreate,
  templateSetActive,
  templateUpdate,
  templatesList,
} from '@lyra/app/vex/timetable.entries';

export const templatesPrism = { fingerprint: templatesList.fingerprint, context: {} };
export const teachersPrism = { fingerprint: teachersList.fingerprint, context: {} };
export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };
export const templateByIdPrism = { fingerprint: templateById.fingerprint, context: { templateId: { $ref: '$.templateId' } } };

const slot = {
  templateId: { $ref: '$.templateId' },
  programId: { $ref: '$.programId' },
  name: { $ref: '$.name' },
  // Numbers arrive as numbers: the fields that feed integer columns are marked
  // numeric in the layout, so no coercion is needed on the way out.
  weekday: { $ref: '$.weekday' },
  startsAt: { $ref: '$.startsAt' },
  durationMins: { $ref: '$.durationMins' },
  capacity: { $ref: '$.capacity' },
  instructorId: { $case: { branches: [{ when: { $ref: '$.instructorId' }, then: { $ref: '$.instructorId' } }], else: null } },
};

export const templateCreatePrism = { fingerprint: templateCreate.fingerprint, context: { ...slot, courseId: null, startsOn: null, endsOn: null } };
export const templateUpdatePrism = { fingerprint: templateUpdate.fingerprint, context: slot };

// One write, and the screen says which way. `pendingActive` is set by the
// trigger that opened it, so the request carries the flag rather than the
// choice being which fingerprint got named.
export const templateSetActivePrism = {
  fingerprint: templateSetActive.fingerprint,
  context: { templateId: { $ref: '$.pendingTemplateId' }, active: { $ref: '$.pendingActive' } },
};

export const sessionCancelPrism = { fingerprint: sessionCancel.fingerprint, context: { sessionId: { $ref: '$.pendingSessionId' } } };
export const sessionRestorePrism = { fingerprint: sessionRestore.fingerprint, context: { sessionId: { $ref: '$.pendingSessionId' } } };

export const programCreatePrism = {
  fingerprint: programCreate.fingerprint,
  context: { programId: { $ref: '$.programId' }, name: { $ref: '$.name' }, blurb: { $ref: '$.blurb' }, colour: { $ref: '$.colour' } },
};
export const programUpdatePrism = {
  fingerprint: programUpdate.fingerprint,
  context: { programId: { $ref: '$.programId' }, name: { $ref: '$.name' }, blurb: { $ref: '$.blurb' }, colour: { $ref: '$.colour' } },
};

export const eventCreatePrism = {
  fingerprint: eventCreate.fingerprint,
  context: {
    programId: { $ref: '$.programId' },
    name: { $ref: '$.name' },
    heldOn: { $ref: '$.heldOn' },
    startsAt: { $ref: '$.startsAt' },
    durationMins: { $ref: '$.durationMins' },
    capacity: { $ref: '$.capacity' },
    instructorId: { $case: { branches: [{ when: { $ref: '$.instructorId' }, then: { $ref: '$.instructorId' } }], else: null } },
  },
};
