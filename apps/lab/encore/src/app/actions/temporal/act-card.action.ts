import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { actCardLayout } from './act-card.layout';
import { actByIdPrism, delaysForActPrism } from './temporal.prism';
import { actRef } from '@encore/app/actions/shared/input-fields';

// Who this is about. One act, its billing, where and when it plays, and every
// hold that has been called on it.
//
// `actId` is REQUIRED: the card is a record, and a record of nobody is nothing.
// The loop offers it as a chip until the model has picked an act it is sure of.
export const actCardAction: ActionDefinition = {
  id: 'act.card',
  title: 'Act',
  description: 'The record card for one act — billing such as headliner or support, genre, expected draw, and the stage and time of their set; open it when a performer, band, DJ or the headliner is the subject.',
  data: { actId: '', act: {}, delays: [], loading: true },
  layout: actCardLayout,
  endpoints: {
    load: { url: '/api/lineup/vex', method: 'POST', request: actByIdPrism, target: 'act' },
    loadDelays: { url: '/api/lineup/vex', method: 'POST', request: delaysForActPrism, target: 'delays' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ call: 'loadDelays', onSuccess: [{ set: 'loading', value: false }] }] }] },
  triggers: [
  ],
};

export const actCardInputSchema = z.toJSONSchema(z.object({ actId: actRef }));
