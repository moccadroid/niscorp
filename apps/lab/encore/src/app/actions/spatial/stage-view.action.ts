import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { stageViewLayout } from './stage-view.layout';
import { stageByIdPrism, stageSetsPrism } from './spatial.prism';
import { dayField } from '@encore/app/actions/shared/input-fields';

export const stageViewAction: ActionDefinition = {
  id: 'stage.view',
  title: 'Stage',
  description: 'One stage in detail — whether it is covered or open-air, its capacity, and the sets on it that day; open it when a particular stage is the subject.',
  data: { stageId: '', day: 'sat', stage: {}, sets: [], loading: true },
  layout: stageViewLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: stageByIdPrism, target: 'stage' },
    loadSets: { url: '/api/lineup/vex', method: 'POST', request: stageSetsPrism, target: 'sets' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ call: 'loadSets', onSuccess: [{ set: 'loading', value: false }] }] }] },
};

export const stageViewInputSchema = z.toJSONSchema(
  z.object({
    stageId: z.string().describe('The stage this is about.').meta({ ref: 'stages' }),
    day: dayField.optional(),
  }),
);
