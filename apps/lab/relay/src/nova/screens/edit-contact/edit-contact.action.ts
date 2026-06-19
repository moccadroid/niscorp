import type { ActionDefinition } from '@niscorp/nova';
import { newContactLayout } from '../new-contact/new-contact.layout';

// Edit a contact. Pushed from the contact-detail "Edit" button, which seeds the
// form fields + id from the open record (via `input`). Reuses the new-contact
// form layout — same form, populated. On mount it loads the company picker. The
// data IS the form (`$.name`, `$.company`, …). Confirm runs `contact.update`,
// announces `contacts-changed` so the detail + list re-read, then pops.
export const editContactAction: ActionDefinition = {
  id: 'edit-contact',
  data: { id: '', name: '', email: '', phone: '', title: '', company: '', companyOptions: [], modalTitle: 'Edit contact', confirmLabel: 'Save' },
  layout: newContactLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    save: { fn: 'contact.update' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }] },
  triggers: [{ event: 'ui:click', ref: 'confirm', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'contacts-changed' } }, { pop: true }] }] }],
};
