import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { companyLayout } from './company.layout';
import { companyByIdPrism, companyContactsPrism, companyDealsPrism } from './company.prism';

export const companyAction: ActionDefinition = {
  id: 'crm.company.view',
  title: '{{$.record.name}}',
  data: { id: '', record: {}, contacts: [], deals: [], loading: true, panelSize: 'wide' },
  layout: companyLayout,
  endpoints: {
    loadRecord:   { url: '/api/companies/vex', method: 'POST', request: companyByIdPrism, target: 'record' },
    loadContacts: { url: '/api/companies/vex', method: 'POST', request: companyContactsPrism, target: 'contacts' },
    loadDeals:    { url: '/api/companies/vex', method: 'POST', request: companyDealsPrism, target: 'deals' },
  },
  lifecycle: { mount: [{ call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadContacts' }, { call: 'loadDeals' }] },
  triggers: [
    { message: 'nav', do: [{ pop: true }] },
    { message: 'detail-close', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'crm.company.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit company', confirmLabel: 'Save', id: '$.record.company_id', name: '$.record.name', domain: '$.record.domain', industry: '$.record.industry', size: '$.record.size' },
          },
        },
      ],
    },
    { message: 'companies-changed', do: [{ call: 'loadRecord' }] },
    { event: 'ui:click', ref: 'open-contact', do: [{ push: { action: 'crm.contact.view', input: { id: '@event.payload' } } }] },
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
  ],
};

export const companyInputSchema = z.toJSONSchema(
  z.object({ id: z.string().describe('company id (use find_records to resolve a name to an id)') }),
);
