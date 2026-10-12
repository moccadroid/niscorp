import { zonesHeat } from '@encore/app/vex/site.entries';
import { stageById, lineupForDay } from '@encore/app/vex/lineup.entries';

export const zonesHeatPrism = {
  fingerprint: zonesHeat.fingerprint,
  context: { day: { $ref: '$.day' }, hour: { $ref: '$.hour' } },
};

export const stageByIdPrism = {
  fingerprint: stageById.fingerprint,
  context: { stageId: { $ref: '$.stageId' } },
};

export const stageSetsPrism = {
  fingerprint: lineupForDay.fingerprint,
  context: { day: { $ref: '$.day' }, stageId: { $ref: '$.stageId' } },
};
