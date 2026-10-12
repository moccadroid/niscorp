import { dealsList, dealsByOwner, dealMoveStage, dealDelete } from '@relay/app/vex/deals.entries';

export const listDealsPrism = {
  fingerprint: {
    $case: {
      branches: [{ when: { $ref: '$.ownerId' }, then: dealsByOwner.fingerprint }],
      else: dealsList.fingerprint,
    },
  },
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    ownerId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.ownerId' }, 'me'] }, then: { $ref: '$.userId' } }], else: { $ref: '$.ownerId' } } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const moveDealPrism = {
  fingerprint: dealMoveStage.fingerprint,
  context: { deal_id: { $ref: '$.moveId' }, stage_id: { $ref: '$.moveStage' } },
};

export const deleteDealPrism = {
  fingerprint: dealDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
