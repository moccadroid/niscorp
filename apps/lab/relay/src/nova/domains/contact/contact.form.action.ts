import type { ActionDefinition } from '@niscorp/nova';
import { contactFormLayout } from './contact.form.layout';

// The contact form — create AND edit in one action (Approach B: `$.saveFn` picks
// the write). Bare push is CREATE (`saveFn` defaults to `contact.create`, fields
// empty); an edit push overrides `saveFn:'contact.update'` + the `id` and fields.
// On mount it loads the company picker (shared `options.companies` read). On
// success it announces `contacts-changed`, opens the saved contact in the detail
// rail, and pops — identical for create (new contact) and edit (the same one).
export const contactFormAction: ActionDefinition = {
  id: 'contact.form',
  data: {
    saveFn: 'contact.create',
    modalTitle: 'New contact',
    confirmLabel: 'Create',
    id: '', name: '', email: '', phone: '', title: '', company: '', companyOptions: [],
  },
  layout: contactFormLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    save: { fn: '{{$.saveFn}}', target: 'saved' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'save',
          onSuccess: [
            { emit: { channel: 'contacts-changed' } },
            { replace: { action: 'contact', canvas: 'detail', input: { id: '$.saved.id' } } },
            { pop: true },
          ],
        },
      ],
    },
  ],
};
