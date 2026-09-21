import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { impactAct, impactCapacity, impactCover, impactStageDay } from '@encore/app/vex/impact.entries';
import { actRef, dayField, toStageRef } from '@encore/app/actions/shared/input-fields';
import { moveImpactLayout } from './move-impact.layout';

// WHAT WOULD THIS MOVE DO? — the card that stands beside `slot.swap`.
//
// A form says what you are about to do; this says what it would cost. Four
// lines, each with a verdict computed in the read (vex/impact.entries.ts):
// does the crowd fit, is the stage free, is there time to change over, is
// there a roof between the act and the weather.
//
// BOTH SPEEDS CAN AIM IT, because its inputs are the kinds both speeds produce:
// two row references Jev picks from candidates and the agent may name, a day,
// and a time the parser reads. `actId` and `toStageId` are the SAME fields as
// the swap form's — same schema object, same words — so they are the same
// QUESTIONS, asked once, and the two cards cannot be aimed at different moves.
//
// IT FOLLOWS THE FORM, IN PLACE. The swap form announces its draft on the
// `move-draft` channel whenever a person changes one of its fields; this card
// takes the new values and re-reads, without being re-mounted — so the operator
// can walk the to-stage down the list and watch the verdicts change under it.
// (When JEV re-aims it, from the sentence, nova's own rule applies: the keys a
// mount load reads re-open the card, so a verdict can never sit under an aim it
// was not computed for.)
//
// The reads chain, because each is asked with something the one before found:
// the act's draw and set length, then the stage against that draw — which also
// says whether it has a roof — then the weather against that.

// A time of day as minutes since midnight. Prism has no string-to-number, but it
// has dates: the distance from midnight to that time on an arbitrary day IS the
// number. (A gap, listed in PLAN.md; this is the workaround, and it is exact.)
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
  // Worded for what it SHOWS, and deliberately not in the swap form's verbs: it
  // is on screen because the form is (canvas-placement.ts COMPANIONS), not
  // because a model rated it — and a description that echoed "move, swap,
  // relocate" would only split those words' weight with the card that owns them.
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
    // The form beside it changed under a person's hand.
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
    // No `fallback`: with no time said the move keeps the set's own start, and
    // the read takes that from the act's row.
    time: z.string().optional().describe('The new start time, 24-hour HH:MM.').meta({ parse: 'time' }),
  }),
);
