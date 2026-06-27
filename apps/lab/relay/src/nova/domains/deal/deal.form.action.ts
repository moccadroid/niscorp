import type { ActionDefinition } from '@niscorp/nova';
import { dealFormLayout } from './deal.form.layout';

// The deal form — create AND edit in one action. The single `save` endpoint is
// the `deal.upsert` mutation, which desugars to insert (no `id`) or update (`id`
// set): a bare push creates, an edit push (with `id` + the record's fields) edits.
// On mount it loads the company/stage/contact pickers. On success it announces
// `deals-changed` and opens the saved deal. Pushed `with: ['modal']`, so the modal
// fragment supplies the chrome and reads `$.modalTitle` / `$.confirmLabel`.
export const dealFormAction: ActionDefinition = {
  id: 'deal.form',
  data: {
    modalTitle: 'New deal',
    confirmLabel: 'Create',
    id: '', title: '', company: '', stage: '', contact: '', value: '', close_date: '',
    companyOptions: [], stageOptions: [], contactOptions: [],
  },
  layout: dealFormLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    loadStages: { fn: 'options.stages', target: 'stageOptions' },
    loadContacts: { fn: 'options.contacts', target: 'contactOptions' },
    // One write — `deal.upsert` desugars to insert (id empty) or update (id set).
    save: { fn: 'deal.upsert', target: 'saved' },
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
