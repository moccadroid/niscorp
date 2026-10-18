import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { contactFormLayout } from './contact.form.layout';
import { companyOptions } from '@relay/app/vex/deals.entries';
import { upsertContactPrism } from './contact.form.prism';

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

export const contactFormInputSchema = z.toJSONSchema(
  z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional().describe('company id'),
    id: z.string().optional(),
    modalTitle: z.string().optional().describe('modal heading, e.g. "Edit contact"'),
    confirmLabel: z.string().optional().describe('confirm button label, e.g. "Save"'),
  }),
);
