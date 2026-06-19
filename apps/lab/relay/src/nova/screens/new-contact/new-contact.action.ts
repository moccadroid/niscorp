import type { ActionDefinition } from '@niscorp/nova';
import { newContactLayout } from './new-contact.layout';

// The "create a contact" form. Pushed onto the `modal` canvas `with: ['modal']`.
// On mount it loads the company picker options. The data IS the form (a single
// "Name", a Company picker); `create` runs `contact.create`, whose input prism
// maps it to columns. On success → announce `contacts-changed` (list re-reads),
// open the new contact's detail, pop (emit before pop; the detail is a different
// canvas so it survives).
export const newContactAction: ActionDefinition = {
  id: 'new-contact',
  data: { name: '', email: '', phone: '', title: '', company: '', companyOptions: [], modalTitle: 'New contact', confirmLabel: 'Create' },
  layout: newContactLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    create: { fn: 'contact.create', target: 'created' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'create',
          onSuccess: [
            { emit: { channel: 'contacts-changed' } },
            { replace: { action: 'contact-detail', canvas: 'detail', input: { id: '$.created.id' } } },
            { pop: true },
          ],
        },
      ],
    },
  ],
};
