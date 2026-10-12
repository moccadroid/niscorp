import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { slotSwapLayout } from './slot-swap.layout';
import { formActPrism, stageOptionsPrism, slotSwapPrism } from './do.prism';
import { actRef, dayField, toStageRef } from '@encore/app/actions/shared/input-fields';
import { MOVE_DRAFT_CHANNEL } from '@encore/app/actions/live/move-impact.action';

export const slotSwapAction: ActionDefinition = {
  id: 'slot.swap',
  title: 'Move a set',
  description: 'The form that moves the set of one act to another stage or start time — a slot swap on the running order; open it when the operator wants to move, swap, relocate or reschedule an act.',
  data: { actId: '', fromStageId: '', toStageId: '', day: 'sat', time: '', act: {}, stages: [], saved: false, error: '' },
  layout: slotSwapLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: formActPrism, target: 'act' },
    loadStages: { url: '/api/vex', method: 'POST', request: stageOptionsPrism, target: 'stages' },
    swap: { url: '/api/lineup/vex', method: 'POST', request: slotSwapPrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'loadStages' }, { call: 'load', onSuccess: [{ set: 'fromStageId', from: 'act.stage_id' }] }],
  },
  triggers: [
    // `ui:model` lands its write before triggers fire, so the payload is the new value.
    ...['to', 'from', 'day', 'time'].map((ref) => ({
      event: 'ui:model',
      ref,
      do: [{ emit: { channel: MOVE_DRAFT_CHANNEL, payload: { actId: '$.actId', toStageId: '$.toStageId', day: '$.day', time: '$.time' } } }],
    })),
    {
      event: 'ui:click',
      ref: 'submit',
      do: [
        { set: 'error', value: '' },
        { call: 'swap', onSuccess: [{ set: 'saved', value: true }] },
      ],
    },
  ],
};

export const slotSwapInputSchema = z.toJSONSchema(
  z.object({
    actId: actRef.optional(),
    fromStageId: z.string().optional().describe('The stage the act is moving from.').meta({ ref: 'stages' }),
    toStageId: toStageRef.optional(),
    day: dayField.optional(),
    // No `fallback`: with no time said, the time is left for the operator, not set to now.
    time: z.string().optional().describe('The new start time, 24-hour HH:MM.').meta({ parse: 'time' }),
  }),
);
