import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { contactLayout } from './contact.layout';
import { contactByIdPrism, contactDealsPrism, contactTasksPrism, contactActivityPrism } from './contact.prism';
import { setDoneTaskPrism } from '../task/tasks.prism';

export const contactAction: ActionDefinition = {
  id: 'crm.contact.view',
  title: '{{$.record.name}}',
  data: { id: '', record: {}, deals: [], tasks: [], activity: [], loading: true, toggleId: '', toggleDone: false, panelSize: 'wide' },
  layout: contactLayout,
  endpoints: {
    load:         { url: '/api/contacts/vex', method: 'POST', request: contactByIdPrism, target: 'record' },
    loadDeals:    { url: '/api/contacts/vex', method: 'POST', request: contactDealsPrism, target: 'deals' },
    loadTasks:    { url: '/api/contacts/vex', method: 'POST', request: contactTasksPrism, target: 'tasks' },
    loadActivity: { url: '/api/contacts/vex', method: 'POST', request: contactActivityPrism, target: 'activity' },
    setDone:      { url: '/api/tasks/vex',              method: 'POST', request: setDoneTaskPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadDeals' }, { call: 'loadTasks' }, { call: 'loadActivity' }] },
  triggers: [
    { message: 'nav', do: [{ pop: true }] },
    { message: 'detail-close', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'crm.contact.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit contact', confirmLabel: 'Save', id: '$.record.contact_id', name: '$.record.name', email: '$.record.email', phone: '$.record.phone', title: '$.record.title', company: '$.record.company.company_id' },
          },
        },
      ],
    },
    { message: 'contacts-changed', do: [{ call: 'load' }] },
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
    { event: 'ui:click', ref: 'open-company', do: [{ push: { action: 'crm.company.view', input: { id: '@event.payload' } } }] },
  ],
};

export const contactInputSchema = z.toJSONSchema(
  z.object({ id: z.string().describe('contact id (use find_records to resolve a name to an id)') }),
);
