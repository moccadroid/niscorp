import { actById, slotSwap, delayAdd } from '@encore/app/vex/lineup.entries';
import { candidateStages } from '@encore/app/vex/candidates.entries';
import { pushesRecent, pushSend } from '@encore/app/vex/push.entries';

// The `do` forms' request seams. A write is the same wire shape as a read —
// `{ fingerprint, context }` — and the context is the form's own data. Note
// what no body carries: who is pressing the button. `created_by` is stamped by
// the engine from the session (vex/behaviors.ts).

export const formActPrism = {
  fingerprint: actById.fingerprint,
  context: { actId: { $ref: '$.actId' } },
};

// The stage picker's options are the same labelled rows the model chose among.
// One list, two readers — so what the operator can pick and what the model
// could have picked cannot drift apart.
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
