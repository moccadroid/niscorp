import type { ActionDefinition } from '@niscorp/nova';
import { newDealLayout } from '../new-deal/new-deal.layout';

// Edit a deal. Pushed from the deal workspace's Edit button, which seeds the
// form's id + RAW fields from the loaded record — `value` is the number and
// `close_date`/`stage`/`company`/`contact` are the raw ids/values (dealById now
// exposes them alongside the formatted `*_display`), so a numeric/date input and
// the id-bearing selects round-trip. Reuses the new-deal form layout; on mount it
// loads the pickers. Confirm runs `deal.update`, announces `deals-changed` (the
// modal/board/list re-read), then pops.
export const editDealAction: ActionDefinition = {
  id: 'edit-deal',
  data: { id: '', title: '', company: '', stage: '', contact: '', value: 0, close_date: '', companyOptions: [], stageOptions: [], contactOptions: [], modalTitle: 'Edit deal', confirmLabel: 'Save' },
  layout: newDealLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    loadStages: { fn: 'options.stages', target: 'stageOptions' },
    loadContacts: { fn: 'options.contacts', target: 'contactOptions' },
    save: { fn: 'deal.update' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }, { call: 'loadStages' }, { call: 'loadContacts' }] },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'deals-changed' } }, { pop: true }] }] }],
};
