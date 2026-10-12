import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { lineupTimelineLayout } from './lineup-timeline.layout';
import { lineupForDayPrism } from './temporal.prism';
import { dayField } from '@encore/app/actions/shared/input-fields';

export const lineupTimelineAction: ActionDefinition = {
  id: 'lineup.timeline',
  title: 'Running order',
  description: 'The running order — every stage and its sets across one day on an hour axis, with one act lit and every set exposed to bad weather lit up; open it when an act, the headliner, a clash, a changeover or a set time is mentioned, or when a storm, rain or wind threatens the programme.',
  data: { day: 'sat', stageId: '', highlightActId: '', slots: [], loading: true },
  layout: lineupTimelineLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: lineupForDayPrism, target: 'slots' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
};

export const lineupTimelineInputSchema = z.toJSONSchema(
  z.object({
    day: dayField.optional(),
    stageId: z.string().optional().describe('Show only the sets on this one stage; leave unset for every stage.').meta({ ref: 'stages' }),
    highlightActId: z.string().optional().describe('The act whose set is lit on the running order.').meta({ ref: 'acts' }),
  }),
);
