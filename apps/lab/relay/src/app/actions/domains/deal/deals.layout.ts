import type { LayoutNode } from '@niscorp/nova';
import { dealsTableLayout } from './deals.table.layout';
import { dealsBoardLayout } from './deals.board.layout';

// The deals collection is ONE action with TWO layouts — `$.view` picks which.
// 'board' → the pipeline Kanban; anything else → the sortable table. The two
// views are just presentations of the same deals data; nothing about the action
// changes when you switch. This is the layout-ref toggle the whole refactor is
// built to show off.
export const dealsLayout: LayoutNode = {
  if: { $eq: ['$.view', 'board'] },
  then: dealsBoardLayout,
  else: dealsTableLayout,
};
