import { dealsList, dealsByOwner, dealsBoard, dealsOpenByStage, dealsForecast } from '@relay/api/deals';

// Read seams for the deals collection — both views in one place.
//
// Table (`deals.list`): `$.ownerId` '' → all deals (`dealsList`); 'me' → the
// current user (My-deals tab, resolved to the injected `$.userId`); any other
// value → that owner (a cross-link). When set, the seam switches to the
// `dealsByOwner` shape (the cache key Vex looks up).
//
// Board (`board.*`): three reads into slots of `$.board` — the stage columns, the
// cards, and the forecast bar (one aggregated object). None take caller input.
export const dealsReads: Record<string, unknown> = {
  'deals.list': {
    shape: {
      $case: {
        branches: [{ when: { $ref: '$.ownerId' }, then: { $const: dealsByOwner.shape } }],
        else: { $const: dealsList.shape },
      },
    },
    context: {
      q: { $join: { parts: ['%', { $ref: '$.q' }, '%'], sep: '' } },
      ownerId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.ownerId' }, 'me'] }, then: { $ref: '$.userId' } }], else: { $ref: '$.ownerId' } } },
      sortBy: { $ref: '$.sortBy' },
      sortDir: { $ref: '$.sortDir' },
    },
  },
  'board.stages': { shape: { $const: dealsOpenByStage.shape }, context: {} },
  'board.deals': { shape: { $const: dealsBoard.shape }, context: {} },
  'board.summary': { shape: { $const: dealsForecast.shape }, context: {} },
};

// Mutation input seam: the board drag-drop stashes the move flat
// (`moveId`/`moveStage`); map it to the `deal.moveStage` columns.
export const dealsMutations: Record<string, unknown> = {
  'deal.moveStage': { deal_id: { $ref: '$.moveId' }, stage_id: { $ref: '$.moveStage' } },
};
