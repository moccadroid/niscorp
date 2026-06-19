import type { ActionDefinition } from '@niscorp/nova';
import { dealsBoardLayout } from './deals-board.layout';

// The pipeline board. On mount `loadBoard` fills `$.board` with { stages, deals }.
// A card click opens the deal in the detail panel; a card dropped on a column
// fires `ui:drop` carrying { id: deal_id, toStage: stage_id }. We stash those
// flat, run `deal.moveStage` (UPDATE), then reload the three slots — the card
// lands in its new column.
export const dealsBoardAction: ActionDefinition = {
  id: 'deals-board',
  data: { board: { stages: [], deals: [], summary: {} }, loading: true, moveId: '', moveStage: '' },
  layout: dealsBoardLayout,
  // The columns, the cards, and the forecast bar are each their own read into a
  // slot of `$.board`. The layout binds the slots. `move` writes a stage change.
  endpoints: {
    loadStages: { fn: 'board.stages', target: 'board.stages' },
    loadDeals: { fn: 'board.deals', target: 'board.deals' },
    loadSummary: { fn: 'board.summary', target: 'board.summary' },
    move: { fn: 'deal.moveStage' },
  },
  lifecycle: { mount: [{ call: 'loadStages', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
  triggers: [
    // A card opens the deal workspace as a MODAL over the board (not the side
    // panel — the board needs its width).
    { event: 'ui:click', ref: 'card', do: [{ push: { action: 'deal-modal', canvas: 'modal', input: { id: '@event.payload' } } }] },
    // Drag a card onto a stage → stash { deal_id, stage_id } flat, persist the
    // move, then reload the slots so the card lands in its new column.
    {
      event: 'ui:drop',
      ref: 'move-deal',
      do: [
        { set: 'moveId', value: '@event.payload.id' },
        { set: 'moveStage', value: '@event.payload.toStage' },
        { call: 'move', onSuccess: [{ call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
      ],
    },
    // One create path: the topbar's + New opens the new-deal form (it has a Stage
    // select, so there's no need for a per-column add button too).
    { message: 'new', do: [{ push: { action: 'new-deal', canvas: 'modal', with: ['modal'] } }] },
    // A deal changed elsewhere (won/lost in the modal, a create) → reload the slots.
    { message: 'deals-changed', do: [{ call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
  ],
};
