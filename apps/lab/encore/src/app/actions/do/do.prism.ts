import { actById, slotSwap, delayAdd } from '@encore/app/vex/lineup.entries';
import { candidateStages } from '@encore/app/vex/candidates.entries';
import { pushesRecent, pushSend } from '@encore/app/vex/push.entries';

export const formActPrism = {
  fingerprint: actById.fingerprint,
  context: { actId: { $ref: '$.actId' } },
};

// The same labelled rows the model chooses among, so what the operator can pick
// and what the model can pick cannot drift apart.
export const stageOptionsPrism = { fingerprint: candidateStages.fingerprint, context: {} };

export const slotSwapPrism = {
  fingerprint: slotSwap.fingerprint,
  context: {
    actId: { $ref: '$.actId' },
    day: { $ref: '$.day' },
    fromStageId: { $ref: '$.fromStageId' },
    toStageId: { $ref: '$.toStageId' },
    time: { $ref: '$.time' },
  },
};

export const delayAddPrism = {
  fingerprint: delayAdd.fingerprint,
  context: { actId: { $ref: '$.actId' }, minutes: { $ref: '$.minutes' } },
};

export const pushesRecentPrism = { fingerprint: pushesRecent.fingerprint, context: {} };

export const pushSendPrism = {
  fingerprint: pushSend.fingerprint,
  context: { audience: { $ref: '$.audience' }, urgency: { $ref: '$.urgency' }, body: { $ref: '$.body' } },
};
