import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { lineupTimelineLayout } from './lineup-timeline.layout';
import { lineupForDayPrism } from './temporal.prism';
import { dayField } from '@encore/app/actions/shared/input-fields';

// The running order. `day` and `stageId` decide what it LOADS, so re-aiming
// either re-mounts the card; `highlightActId` only decides which bar is lit, so
// the loop writes it in place and the timeline never flickers while the
// operator is still typing the act's name.
export const lineupTimelineAction: ActionDefinition = {
  id: 'lineup.timeline',
  title: 'Running order',
  // The second half is slice 2a's: the running order is also where a storm
  // becomes a list of names, so weather is a reason to open it.
  description: 'The running order — every stage and its sets across one day on an hour axis, with one act lit and every set exposed to bad weather lit up; open it when an act, the headliner, a clash, a changeover or a set time is mentioned, or when a storm, rain or wind threatens the programme.',
  data: { day: 'sat', stageId: '', highlightActId: '', slots: [], loading: true },
  layout: lineupTimelineLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: lineupForDayPrism, target: 'slots' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  // A swap elsewhere in the room moves a bar here: writers announce, viewers
  // re-read.
};

export const lineupTimelineInputSchema = z.toJSONSchema(
  z.object({
    day: dayField.optional(),
    stageId: z.string().optional().describe('Show only the sets on this one stage; leave unset for every stage.').meta({ ref: 'stages' }),
    highlightActId: z.string().optional().describe('The act whose set is lit on the running order.').meta({ ref: 'acts' }),
  }),
);
