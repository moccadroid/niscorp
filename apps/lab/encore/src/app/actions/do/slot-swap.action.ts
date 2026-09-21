import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { slotSwapLayout } from './slot-swap.layout';
import { formActPrism, stageOptionsPrism, slotSwapPrism } from './do.prism';
import { actRef, dayField, toStageRef } from '@encore/app/actions/shared/input-fields';
import { MOVE_DRAFT_CHANNEL } from '@encore/app/actions/live/move-impact.action';

// MOVE A SET. The form the storm sentence ends in.
//
// The loop prefills it — act, to-stage, day, time — and then stops. Nothing
// here submits itself: PLAN.md's fourth claim is that the model never presses a
// button, and the button is `submit`, caught by a trigger only a person's click
// can fire.
//
// FROM-STAGE IS READ, NOT GUESSED. Where an act is playing is a row in `slots`,
// so once an act is chosen the mount load copies its current stage into
// `fromStageId`, over whatever was seeded. It stays an input because an opener
// may legitimately name it ("from main to the tent"), but the running order
// outranks the sentence — and the mutation's WHERE carries it, so a form filled
// against a bill that has since moved writes nothing rather than the wrong row.
//
// `actId` re-mounts the card (it is what the mount load reads); the rest are
// written in place, so the form does not blink while the operator finishes the
// sentence.
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
    // A PERSON CHANGED THE DRAFT. The form says so, with what it now holds, and
    // whoever is showing the consequences of this move re-reads — in place.
    // (`ui:model` lands its write before triggers fire, so this is the new
    // value, not the one being replaced.)
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
        // Nothing is announced: the write lands, moss says `slots` was written,
        // and every card showing a slot — this form included — re-reads
        // (app/reload-on-write.ts). A form does not know who is looking.
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
    // No `fallback`: a swap with no time said is a form with the time left for
    // the operator, not a swap to right now.
    time: z.string().optional().describe('The new start time, 24-hour HH:MM.').meta({ parse: 'time' }),
  }),
);
