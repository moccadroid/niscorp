import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { setDelayLayout } from './set-delay.layout';
import { formActPrism, delayAddPrism } from './do.prism';
import { actRef } from '@encore/app/actions/shared/input-fields';

export const setDelayAction: ActionDefinition = {
  id: 'set.delay',
  title: 'Delay a set',
  description: 'The form that delays the set of one act by a number of minutes — a hold on the running order; open it when the operator wants to delay, hold, postpone or push back an act.',
  data: { actId: '', minutes: 15, act: {}, saved: false, error: '' },
  layout: setDelayLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: formActPrism, target: 'act' },
    save: { url: '/api/lineup/vex', method: 'POST', request: delayAddPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'submit',
      do: [{ set: 'error', value: '' }, { call: 'save', onSuccess: [{ set: 'saved', value: true }] }],
    },
  ],
};

export const setDelayInputSchema = z.toJSONSchema(
  z.object({
    actId: actRef.optional(),
    minutes: z.number().int().min(0).max(120).optional().describe('How many minutes to hold the set for, 0–120.').meta({ parse: 'minutes' }),
  }),
);
