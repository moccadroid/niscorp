import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { dealFormLayout } from './deal.form.layout';
import { upsertDealPrism } from './deal.form.prism';
import { companyOptions, stageOptions, contactOptions } from '@relay/app/data/api/deals';

// The deal form — create AND edit in one action. The single `save` endpoint is
// the `deal.upsert` mutation, which desugars to insert (no `id`) or update (`id`
// set): a bare push creates, an edit push (with `id` + the record's fields) edits.
// On mount it loads the company/stage/contact pickers. On success it announces
// `deals-changed` and opens the saved deal. Pushed `with: ['modal']`, so the modal
// fragment supplies the chrome and reads `$.modalTitle` / `$.confirmLabel`.
export const dealFormAction: ActionDefinition = {
  id: 'crm.deal.form',
  data: {
    modalTitle: 'New deal',
    confirmLabel: 'Create',
    id: '', title: '', company: '', stage: '', contact: '', value: '', close_date: '',
    companyOptions: [], stageOptions: [], contactOptions: [],
  },
  layout: dealFormLayout,
  endpoints: {
    // Picker reads take no caller input — plain JSON replays, no prism seam.
    loadCompanies: { url: '/api/companies/vex', method: 'POST', request: { fingerprint: companyOptions.fingerprint, context: {} }, target: 'companyOptions' },
    loadStages:    { url: '/api/deals/vex',     method: 'POST', request: { fingerprint: stageOptions.fingerprint, context: {} }, target: 'stageOptions' },
    loadContacts:  { url: '/api/contacts/vex',  method: 'POST', request: { fingerprint: contactOptions.fingerprint, context: {} }, target: 'contactOptions' },
    // One write — `deal.upsert` desugars to insert (id empty) or update (id set).
    save:          { url: '/api/deals/vex',               method: 'POST', request: upsertDealPrism, target: 'saved' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }, { call: 'loadStages' }, { call: 'loadContacts' }] },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [{ call: 'save', onSuccess: [{ emit: { channel: 'deals-changed' } }, { pop: true }] }],
    },
  ],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const dealFormInputSchema = z.toJSONSchema(
  z.object({
    title: z.string().optional(),
    company: z.string().optional().describe('company id'),
    stage: z.string().optional().describe('stage id'),
    contact: z.string().optional().describe('primary contact id'),
    value: z.number().optional(),
    close_date: z.string().optional().describe('ISO date'),
    id: z.string().optional().describe('deal id when editing'),
  }),
);
