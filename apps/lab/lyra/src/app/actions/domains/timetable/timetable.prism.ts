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
  templateRestore,
  templateRetire,
  templateUpdate,
  templatesList,
} from '@lyra/app/vex/timetable.entries';

export const templatesPrism = { fingerprint: templatesList.fingerprint, context: {} };
export const teachersPrism = { fingerprint: teachersList.fingerprint, context: {} };
export const programsPrism = { fingerprint: programsList.fingerprint, context: {} };
export const templateByIdPrism = { fingerprint: templateById.fingerprint, context: { templateId: { $ref: '$.templateId' } } };

// The whole slot, in one shape. `instructorId` may be empty — an unassigned
// class is an ordinary state, not a validation failure, and a studio hiring in
// September should be able to put the grid up in August.
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
  // "Unassigned" is an empty option, and an empty string is not a staff id —
  // it would fail the foreign key. NULL is what "nobody yet" means in a
  // column, so that is what goes.
  instructorId: { $case: { branches: [{ when: { $ref: '$.instructorId' }, then: { $ref: '$.instructorId' } }], else: null } },
};

// A WEEKLY SLOT HAS NO COURSE AND NO BOUNDS, and now says so rather than
// omitting the keys. The insert grammar gained those three columns so a course
// can own its slots; an ongoing class sends null for all of them, which is the
// difference between the two in one place.
export const templateCreatePrism = { fingerprint: templateCreate.fingerprint, context: { ...slot, courseId: null, startsOn: null, endsOn: null } };
export const templateUpdatePrism = { fingerprint: templateUpdate.fingerprint, context: slot };

export const templateRetirePrism = { fingerprint: templateRetire.fingerprint, context: { templateId: { $ref: '$.pendingTemplateId' } } };
export const templateRestorePrism = { fingerprint: templateRestore.fingerprint, context: { templateId: { $ref: '$.pendingTemplateId' } } };

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

// The one-off. Every value is authored on the form; `week_key` and `hour_key`
// are absent because a trigger derives them, and `studio_id` because the
// engine stamps it.
export const eventCreatePrism = {
  fingerprint: eventCreate.fingerprint,
  context: {
    programId: { $ref: '$.programId' },
    name: { $ref: '$.name' },
    heldOn: { $ref: '$.heldOn' },
    startsAt: { $ref: '$.startsAt' },
    durationMins: { $ref: '$.durationMins' },
    capacity: { $ref: '$.capacity' },
    // Empty means unassigned, and an empty STRING is not a staff id — it fails
    // the foreign key. The slot form above already learned this; a one-off has
    // to say it too, because a prism is per-write rather than per-column.
    instructorId: { $case: { branches: [{ when: { $ref: '$.instructorId' }, then: { $ref: '$.instructorId' } }], else: null } },
  },
};
