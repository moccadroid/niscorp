import type { ActionDefinition } from '@niscorp/nova';
import { contactFormLayout } from './contact.form.layout';

// The contact form — create AND edit in one action. The `save` endpoint is the
// `contact.upsert` mutation, which desugars to insert (no `id`) or update (`id`
// set): a bare push creates, an edit push (with `id` + fields) edits. On mount it
// loads the company picker (shared `options.companies` read). On success it
// announces `contacts-changed`, opens the saved contact, and pops.
export const contactFormAction: ActionDefinition = {
  id: 'contact.form',
  data: {
    modalTitle: 'New contact',
    confirmLabel: 'Create',
    id: '', name: '', email: '', phone: '', title: '', company: '', companyOptions: [],
  },
  layout: contactFormLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    // One write — `contact.upsert` desugars to insert (id empty) or update (id set).
    save: { fn: 'contact.upsert', target: 'saved' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }] },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'save',
          onSuccess: [{ emit: { channel: 'contacts-changed' } }, { pop: true }],
        },
      ],
    },
  ],
};
