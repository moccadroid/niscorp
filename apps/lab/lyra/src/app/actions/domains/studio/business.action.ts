import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { studioBusinessLayout } from './business.layout';
import { setBusinessPrism, setLegalFormPrism, studioSelfPrism } from './studio.prism';

// The studio's own identity — the screen a new studio starts on, and the one a
// payments integration is waiting for. Its own action rather than a section of
// Appearance: what a business IS and what it LOOKS LIKE are different questions,
// and only one of them stops money moving.
export const studioBusinessAction: ActionDefinition = {
  id: 'studio.business',
  title: 'Business',
  data: {
    studioId: '',
    studioName: '',
    studioRow: {},
    legalName: '',
    address: '',
    vatId: '',
    pendingLegalForm: '',
    legalSaved: false,
    error: '',
  },
  layout: studioBusinessLayout,
  endpoints: {
    self: { url: '/api/studio/vex', method: 'POST', request: studioSelfPrism, target: 'studioRow' },
    setLegalForm: { url: '/api/studio/vex', method: 'POST', request: setLegalFormPrism, errorTarget: 'error' },
    setBusiness: { url: '/api/studio/vex', method: 'POST', request: setBusinessPrism, errorTarget: 'error' },
  },
  // SEEDED FROM THE ROW, so the fields open holding what is already there rather
  // than empty — an empty field beside a Save button writes the emptiness back.
  lifecycle: {
    mount: [
      {
        call: 'self',
        onSuccess: [
          { set: 'legalName', value: '$.studioRow.legal_name' },
          { set: 'address', value: '$.studioRow.address' },
          { set: 'vatId', value: '$.studioRow.vat_id' },
        ],
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'saveBusiness',
      do: [
        { set: 'error', value: '' },
        { call: 'setBusiness', onSuccess: [{ set: 'legalSaved', value: true }, { call: 'self' }] },
      ],
    },
    {
      // Saved on choosing: a Select with a Save button beside it is two acts for
      // one decision.
      event: 'ui:model',
      ref: 'legalForm',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingLegalForm', value: '@event.payload' },
        { call: 'setLegalForm', onSuccess: [{ set: 'legalSaved', value: true }, { call: 'self' }] },
      ],
    },
  ],
};

export const studioBusinessInputSchema = z.toJSONSchema(
  z.object({
    studioId: z.string().optional().describe('Seeded from the session; the engine narrows the write to it regardless.'),
    studioName: z.string().optional().describe('For the heading. Seeded from the session.'),
  }),
);
