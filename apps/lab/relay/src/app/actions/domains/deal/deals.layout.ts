import type { LayoutNode } from '@niscorp/nova';
import { dealsTableLayout } from './deals.table.layout';
import { dealsBoardLayout } from './deals.board.layout';

export const dealsLayout: LayoutNode = {
  if: { $eq: ['$.view', 'board'] },
  then: dealsBoardLayout,
  else: dealsTableLayout,
};
