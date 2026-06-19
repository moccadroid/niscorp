import type { ActionDefinition } from '@niscorp/nova';
import { newCompanyLayout } from '../new-company/new-company.layout';

// Edit a company. Pushed from the company-detail "Edit" button, which seeds the
// form fields + id from the open record. Reuses the new-company form layout —
// same form, populated. Confirm runs `company.update`, announces
// `companies-changed` so the detail + list re-read, then pops.
export const editCompanyAction: ActionDefinition = {
  id: 'edit-company',
  data: { id: '', name: '', domain: '', industry: '', size: '', modalTitle: 'Edit company', confirmLabel: 'Save' },
  layout: newCompanyLayout,
  endpoints: { save: { fn: 'company.update' } },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'companies-changed' } }, { pop: true }] }] }],
};
