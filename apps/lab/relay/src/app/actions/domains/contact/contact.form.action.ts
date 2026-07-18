import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { contactFormLayout } from './contact.form.layout';
import { companyOptions } from '@relay/app/vex/deals.entries';
import { upsertContactPrism } from './contact.form.prism';

// The contact form — create AND edit in one action. The `save` endpoint is the
// `contact.upsert` mutation, which desugars to insert (no `id`) or update (`id`
// set): a bare push creates, an edit push (with `id` + fields) edits. On mount it
// loads the company picker (shared `options.companies` read). On success it
// announces `contacts-changed`, opens the saved contact, and pops.
export const contactFormAction: ActionDefinition = {
  id: 'crm.contact.form',
  data: {
    modalTitle: 'New contact',
    confirmLabel: 'Create',
    id: '', name: '', email: '', phone: '', title: '', company: '', companyOptions: [],
  },
  layout: contactFormLayout,
  endpoints: {
    loadCompanies: { url: '/api/companies/vex', method: 'POST', request: { fingerprint: companyOptions.fingerprint, context: {} }, target: 'companyOptions' },
    // One write — `contact.upsert` desugars to insert (id empty) or update (id set).
    save:          { url: '/api/contacts/vex',            method: 'POST', request: upsertContactPrism, target: 'saved' },
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

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const contactFormInputSchema = z.toJSONSchema(
  z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional().describe('company id'),
    id: z.string().optional(),
  }),
);
