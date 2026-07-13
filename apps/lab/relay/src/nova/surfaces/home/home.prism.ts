import { dealsByStatus, dealsByStage } from '@relay/api/deals';
import { tasksOpenCount } from '@relay/api/tasks';

// Four reads into top-level slots. open/won share one shape, picked by
// `context.status`. Each prism is a full Vex query body, attached to an
// endpoint's `request`; the layout binds each slot.
export const homeOpenPrism = { fingerprint: dealsByStatus.fingerprint, context: { status: 'open' } };
export const homeWonPrism = { fingerprint: dealsByStatus.fingerprint, context: { status: 'won' } };
export const homeTasksPrism = { fingerprint: tasksOpenCount.fingerprint, context: {} };
export const homeStagesPrism = { fingerprint: dealsByStage.fingerprint, context: {} };
