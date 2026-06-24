import type { ActionDefinition } from '@niscorp/nova';
import { dealFormLayout } from './deal.form.layout';

// The deal form — create AND edit in one action. The difference is data, not
// structure (Approach B): the single `save` endpoint resolves its handler from
// `{{$.saveFn}}`. Bare (no push input) it's CREATE — `saveFn` defaults to
// `deal.create`, fields empty. An edit push overrides `saveFn:'deal.update'` plus
// the `id` and the record's fields. On success it announces `deals-changed` and
// opens the saved deal — identical for create (the new deal) and edit (the same
// one). Pushed `with: ['modal']`, so the modal fragment supplies the chrome and
// reads `$.modalTitle` / `$.confirmLabel`.
export const dealFormAction: ActionDefinition = {
  id: 'deal.form',
  data: {
    saveFn: 'deal.create',
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
    save: { fn: '{{$.saveFn}}', target: 'saved' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }, { call: 'loadStages' }, { call: 'loadContacts' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [{ call: 'save', onSuccess: [{ emit: { channel: 'deals-changed' } }, { replace: { action: 'deal', canvas: 'modal', input: { id: '$.saved.id' } } }] }],
    },
  ],
};
