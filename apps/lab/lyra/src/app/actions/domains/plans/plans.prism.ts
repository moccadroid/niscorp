import { plansList } from '@lyra/app/vex/member.entries';
import { planCreate, planRestore, planRetire, planUpdate } from '@lyra/app/vex/reports.entries';

export const plansPrism = { fingerprint: plansList.fingerprint, context: {} };

// `planId` is absent from the create context on purpose — the database mints
// it. Every other field is bound, and `classAllowance` binds to a select that
// hands back a number or an empty string, which is the NULL the column means
// by "unlimited".
export const planCreatePrism = {
  fingerprint: planCreate.fingerprint,
  context: { name: { $ref: '$.name' }, priceCents: { $ref: '$.priceCents' }, interval: { $ref: '$.interval' }, classAllowance: { $ref: '$.classAllowance' } },
};

export const planUpdatePrism = {
  fingerprint: planUpdate.fingerprint,
  context: { planId: { $ref: '$.planId' }, name: { $ref: '$.name' }, priceCents: { $ref: '$.priceCents' }, interval: { $ref: '$.interval' }, classAllowance: { $ref: '$.classAllowance' } },
};

// Retire and restore are the same write with the flag flipped, and both are
// updates rather than deletes — which is the whole point of the screen.
export const planRetirePrism = { fingerprint: planRetire.fingerprint, context: { planId: { $ref: '$.planId' } } };
export const planRestorePrism = { fingerprint: planRestore.fingerprint, context: { planId: { $ref: '$.planId' } } };
