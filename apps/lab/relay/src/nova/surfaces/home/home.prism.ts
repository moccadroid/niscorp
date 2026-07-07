import { dealsByStatus, dealsByStage } from '@relay/api/deals';
import { tasksOpenCount } from '@relay/api/tasks';

// Four reads into top-level slots. open/won share one shape, picked by
// `context.status`. Each prism is a full Vex query body, attached to an
// endpoint's `request`; the layout binds each slot.
export const homeOpenPrism = { shape: { $const: dealsByStatus.shape }, context: { status: 'open' } };
export const homeWonPrism = { shape: { $const: dealsByStatus.shape }, context: { status: 'won' } };
export const homeTasksPrism = { shape: { $const: tasksOpenCount.shape }, context: {} };
export const homeStagesPrism = { shape: { $const: dealsByStage.shape }, context: {} };
