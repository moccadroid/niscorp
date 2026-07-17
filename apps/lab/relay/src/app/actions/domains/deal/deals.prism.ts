import { dealsList, dealsByOwner, dealMoveStage, dealDelete } from '@relay/app/data/api/deals';

// Read/write seams for the deals collection — each a full Vex request body,
// attached to an endpoint's `request`. (Query → { fingerprint, context }; write →
// { mutation, context }.)
//
// Table (`listDealsPrism`): `$.ownerId` '' → all deals (`dealsList`); 'me' → the
// current user (My-deals tab, resolved to the injected `$.userId`); any other
// value → that owner (a cross-link). When set, the seam switches to the
// `dealsByOwner` fingerprint (the cache entry Vex replays).
// (The board's three reads take no caller input — they're plain JSON bodies
// in deals.action.ts, not seams.)
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

// Move write: the board drag-drop stashes the move flat (`moveId`/`moveStage`);
// map it to the `deal.moveStage` columns.
export const moveDealPrism = {
  fingerprint: dealMoveStage.fingerprint,
  context: { deal_id: { $ref: '$.moveId' }, stage_id: { $ref: '$.moveStage' } },
};

// Delete the pending deal (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteDealPrism = {
  fingerprint: dealDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
