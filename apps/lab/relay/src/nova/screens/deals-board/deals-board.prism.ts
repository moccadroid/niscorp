import { dealsBoard, dealsOpenByStage, dealsForecast } from '@relay/api/deals';

// Three reads into slots of `$.board`: the stage columns, the cards, and the
// forecast bar (one object aggregated by its mapping). None take caller input.
export const dealsBoardPrism: Record<string, unknown> = {
  'board.stages': { shape: { $const: dealsOpenByStage.shape }, context: {} },
  'board.deals': { shape: { $const: dealsBoard.shape }, context: {} },
  'board.summary': { shape: { $const: dealsForecast.shape }, context: {} },
};

// Mutation input seam: the drag-drop stashes the move flat (`moveId`/`moveStage`);
// map it to the `deal.moveStage` columns.
export const dealsBoardMutations: Record<string, unknown> = {
  'deal.moveStage': { deal_id: { $ref: '$.moveId' }, stage_id: { $ref: '$.moveStage' } },
};
