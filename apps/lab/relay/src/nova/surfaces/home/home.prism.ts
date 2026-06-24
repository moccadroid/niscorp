import { dealsByStatus, dealsByStage } from '@relay/api/deals';
import { tasksOpenCount } from '@relay/api/tasks';

// Four reads into slots of `$.dash`. open/won share one shape, picked by
// `$context.status`. The layout binds each slot.
export const homePrism: Record<string, unknown> = {
  'home.open': { shape: { $const: dealsByStatus.shape }, context: { status: 'open' } },
  'home.won': { shape: { $const: dealsByStatus.shape }, context: { status: 'won' } },
  'home.tasks': { shape: { $const: tasksOpenCount.shape }, context: {} },
  'home.stages': { shape: { $const: dealsByStage.shape }, context: {} },
};
