import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { companyFormLayout } from './company.form.layout';
import { upsertCompanyPrism } from './company.form.prism';

export const companyFormAction: ActionDefinition = {
  id: 'crm.company.form',
  data: {
    modalTitle: 'New company',
    confirmLabel: 'Create',
    id: '', name: '', domain: '', industry: '', size: '',
  },
  layout: companyFormLayout,
  endpoints: { save: { url: '/api/companies/vex', method: 'POST', request: upsertCompanyPrism, target: 'saved' } },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'save',
          onSuccess: [{ emit: { channel: 'companies-changed' } }, { pop: true }],
        },
      ],
    },
  ],
};

export const companyFormInputSchema = z.toJSONSchema(
  z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    id: z.string().optional(),
  }),
);
