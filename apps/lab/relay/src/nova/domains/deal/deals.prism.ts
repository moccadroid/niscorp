import { dealsList, dealsByOwner, dealsBoard, dealsOpenByStage, dealsForecast, dealMoveStage, dealDelete } from '@relay/api/deals';

// Read/write seams for the deals collection — each a full Vex request body,
// attached to an endpoint's `request`. (Query → { shape, context }; write →
// { mutation, context }.)
//
// Table (`listDealsPrism`): `$.ownerId` '' → all deals (`dealsList`); 'me' → the
// current user (My-deals tab, resolved to the injected `$.userId`); any other
// value → that owner (a cross-link). When set, the seam switches to the
// `dealsByOwner` shape (the cache key Vex looks up).
//
// Board (`board*` prisms): three reads into top-level slots (`stages`/`deals`/`summary`) — the stage columns, the
// cards, and the forecast bar (one aggregated object). None take caller input.
export const listDealsPrism = {
  shape: {
    $case: {
      branches: [{ when: { $ref: '$.ownerId' }, then: { $const: dealsByOwner.shape } }],
      else: { $const: dealsList.shape },
    },
  },
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    ownerId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.ownerId' }, 'me'] }, then: { $ref: '$.userId' } }], else: { $ref: '$.ownerId' } } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const boardStagesPrism = { shape: { $const: dealsOpenByStage.shape }, context: {} };
export const boardDealsPrism = { shape: { $const: dealsBoard.shape }, context: {} };
export const boardSummaryPrism = { shape: { $const: dealsForecast.shape }, context: {} };

// Move write: the board drag-drop stashes the move flat (`moveId`/`moveStage`);
// map it to the `deal.moveStage` columns.
export const moveDealPrism = {
  mutation: { $const: dealMoveStage },
  context: { deal_id: { $ref: '$.moveId' }, stage_id: { $ref: '$.moveStage' } },
};

// Delete the pending deal (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteDealPrism = {
  mutation: { $const: dealDelete },
  context: { id: { $ref: '$.pendingDeleteId' } },
};
