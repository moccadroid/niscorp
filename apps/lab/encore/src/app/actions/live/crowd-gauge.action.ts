import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { crowdGaugeLayout } from './crowd-gauge.layout';
import { zoneCountPrism } from './live.prism';
import { zoneRef, dayField, hourField } from '@encore/app/actions/shared/input-fields';

// How full one zone is at one hour — the number that decides whether moving
// twenty thousand people under canvas is a plan or a crush.
export const crowdGaugeAction: ActionDefinition = {
  id: 'crowd.gauge',
  title: 'Crowd',
  description: 'A gauge of how full one zone is — headcount against capacity at one hour; open it when crowding, capacity, density or whether people will fit somewhere is mentioned.',
  data: { zoneId: '', day: 'sat', hour: 18, count: {}, loading: true },
  layout: crowdGaugeLayout,
  endpoints: {
    load: { url: '/api/site/vex', method: 'POST', request: zoneCountPrism, target: 'count' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
};

export const crowdGaugeInputSchema = z.toJSONSchema(
  z.object({
    zoneId: zoneRef,
    day: dayField.optional(),
    hour: hourField.optional(),
  }),
);
