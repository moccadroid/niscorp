import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { companiesLayout } from './companies.layout';
import { listCompaniesPrism, deleteCompanyPrism } from './companies.prism';

export const companiesAction: ActionDefinition = {
  id: 'crm.companies',
  title: 'Companies',
  data: { search: '', rows: [], loading: true, highlight_id: '', menuOpenId: '', sortBy: 'companies.name', sortDir: 'asc', pendingDeleteId: '', pendingDeleteLabel: '' },
  layout: companiesLayout,
  endpoints: {
    load:   { url: '/api/companies/vex', method: 'POST', request: listCompaniesPrism, target: 'rows' },
    remove: { url: '/api/companies/vex',           method: 'POST', request: deleteCompanyPrism },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }],
    resume: [{ set: 'highlight_id', value: '' }],
  },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { push: { action: 'crm.company.view', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { message: 'new', do: [{ push: { action: 'crm.company.form', canvas: 'modal', with: ['modal'] } }] },
    { message: 'companies-changed', do: [{ call: 'load' }] },
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.company_id' }, { push: { action: 'crm.company.view', input: { id: '@event.payload.company_id' } } }, { set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'crm.company.form', canvas: 'modal', with: ['modal'], input: { modalTitle: 'Edit company', confirmLabel: 'Save', id: '@event.payload.company_id', name: '@event.payload.name', domain: '@event.payload.domain', industry: '@event.payload.industry', size: '@event.payload.size' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.company_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.name' },
        { push: { action: 'confirm-delete', canvas: 'modal', with: ['panel'], input: { label: '@event.payload.name', message: 'This also deletes the company’s contacts and deals. This can’t be undone.' } } },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'companies-changed' } }, { emit: { channel: 'deselect' } }, { emit: { channel: 'detail-close' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};

export const companiesInputSchema = z.toJSONSchema(
  z.object({
    search: z.string().optional(),
    sortBy: z.string().optional().describe("a column: 'companies.name', 'companies.industry', 'companies.size', 'companies.domain'"),
    sortDir: z.enum(['asc', 'desc']).optional(),
    highlight_id: z.string().optional(),
  }),
);
