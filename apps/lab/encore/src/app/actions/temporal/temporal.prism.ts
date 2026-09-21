import { lineupForDay, actById, delaysForAct } from '@encore/app/vex/lineup.entries';

// The temporal cards' request seams.

// `stageId` is an OPTIONAL condition in the entry, and a prism assembles a
// fixed object — it cannot leave a key out. So an empty pick goes over as
// `null`, which vex reads as absent and prunes; '' would be a real value and
// match no stage at all.
export const lineupForDayPrism = {
  fingerprint: lineupForDay.fingerprint,
  context: {
    day: { $ref: '$.day' },
    stageId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.stageId' }, ''] }, then: null }], else: { $ref: '$.stageId' } } },
  },
};

export const actByIdPrism = {
  fingerprint: actById.fingerprint,
  context: { actId: { $ref: '$.actId' } },
};

export const delaysForActPrism = {
  fingerprint: delaysForAct.fingerprint,
  context: { actId: { $ref: '$.actId' } },
};
