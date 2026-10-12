import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { impactAct, impactCapacity, impactCover, impactStageDay } from '@encore/app/vex/impact.entries';
import { actRef, dayField, toStageRef } from '@encore/app/actions/shared/input-fields';
import { moveImpactLayout } from './move-impact.layout';

// A time of day as minutes since midnight. Prism has no string-to-number, but it has
// dates: the distance from midnight to that time on an arbitrary day is the number.
const MIDNIGHT = '2000-01-01T00:00:00';
const time = { $case: { branches: [{ when: { $empty: { $ref: '$.time' } }, then: { $ref: '$.act.starts_at' } }], else: { $ref: '$.time' } } };
const at = { $join: { parts: ['2000-01-01T', time, ':00'], sep: '' } };
const fromMin = { $dateDiff: { from: MIDNIGHT, to: at, unit: 'minute' } };

export const impactActPrism = { fingerprint: impactAct.fingerprint, context: { actId: { $ref: '$.actId' } } };
export const impactCapacityPrism = { fingerprint: impactCapacity.fingerprint, context: { stageId: { $ref: '$.toStageId' }, draw: { $ref: '$.act.draw' } } };
export const impactStageDayPrism = {
  fingerprint: impactStageDay.fingerprint,
  context: { stageId: { $ref: '$.toStageId' }, day: { $ref: '$.day' }, actId: { $ref: '$.actId' }, fromMin, toMin: { $add: [fromMin, { $ref: '$.act.duration_min' }] } },
};
export const impactCoverPrism = { fingerprint: impactCover.fingerprint, context: { day: { $ref: '$.day' }, hour: { $dateDiff: { from: MIDNIGHT, to: at, unit: 'hour' } }, kind: { $ref: '$.fit.kind' } } };

export const MOVE_DRAFT_CHANNEL = 'move-draft';

const reread = [{ call: 'loadAct', onSuccess: [{ call: 'loadStage' }, { call: 'loadFit', onSuccess: [{ call: 'loadCover' }] }] }];

export const moveImpactAction: ActionDefinition = {
  id: 'move.impact',
  title: 'Impact of the move',
  // Deliberately not in the swap form's verbs: the card is on screen because the form
  // is (COMPANIONS), and echoing "move, swap, relocate" would split those words' weight.
  description: 'What a relocation would cost, line by line with a verdict: whether the expected crowd fits the target, what it clashes with on that stage, the changeover gap, and whether that stage has a roof against the weather at that hour.',
  data: { actId: '', toStageId: '', day: 'sat', time: '', act: {}, fit: {}, stage: [], cover: {}, error: '' },
  layout: moveImpactLayout,
  endpoints: {
    loadAct: { url: '/api/lineup/vex', method: 'POST', request: impactActPrism, target: 'act', errorTarget: 'error' },
    loadFit: { url: '/api/lineup/vex', method: 'POST', request: impactCapacityPrism, target: 'fit', errorTarget: 'error' },
    loadStage: { url: '/api/lineup/vex', method: 'POST', request: impactStageDayPrism, target: 'stage', errorTarget: 'error' },
    loadCover: { url: '/api/readings/vex', method: 'POST', request: impactCoverPrism, target: 'cover', errorTarget: 'error' },
  },
  lifecycle: { mount: reread },
  triggers: [
    {
      message: MOVE_DRAFT_CHANNEL,
      do: [
        { set: 'actId', value: '@event.payload.actId' },
        { set: 'toStageId', value: '@event.payload.toStageId' },
        { set: 'day', value: '@event.payload.day' },
        { set: 'time', value: '@event.payload.time' },
        ...reread,
      ],
    },
  ],
};

export const moveImpactInputSchema = z.toJSONSchema(
  z.object({
    actId: actRef,
    toStageId: toStageRef,
    day: dayField.optional(),
    time: z.string().optional().describe('The new start time, 24-hour HH:MM.').meta({ parse: 'time' }),
  }),
);
