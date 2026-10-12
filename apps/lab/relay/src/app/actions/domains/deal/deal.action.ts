import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { dealLayout } from './deal.layout';
import { dealByIdPrism, dealActivitiesPrism, dealLineItemsPrism, dealTasksPrism, dealContactPrism, markWonPrism, markLostPrism } from './deal.prism';
import { setDoneTaskPrism } from '../task/tasks.prism';

export const dealAction: ActionDefinition = {
  id: 'crm.deal.view',
  title: '{{$.record.title}}',
  data: { id: '', record: {}, activities: [], lineItems: [], tasks: [], contact: {}, loading: true, toggleId: '', toggleDone: false, panelSize: 'wide' },
  endpoints: {
    loadRecord:     { url: '/api/deals/vex', method: 'POST', request: dealByIdPrism, target: 'record' },
    loadActivities: { url: '/api/deals/vex', method: 'POST', request: dealActivitiesPrism, target: 'activities' },
    loadLineItems:  { url: '/api/deals/vex', method: 'POST', request: dealLineItemsPrism, target: 'lineItems' },
    loadTasks:      { url: '/api/deals/vex', method: 'POST', request: dealTasksPrism, target: 'tasks' },
    loadContact:    { url: '/api/deals/vex', method: 'POST', request: dealContactPrism, target: 'contact' },
    markWon:        { url: '/api/deals/vex',           method: 'POST', request: markWonPrism },
    markLost:       { url: '/api/deals/vex',           method: 'POST', request: markLostPrism },
    setDone:        { url: '/api/tasks/vex',           method: 'POST', request: setDoneTaskPrism },
  },
  layout: dealLayout,
  lifecycle: {
    mount: [
      { call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }, { call: 'loadContact' }] },
      { call: 'loadActivities' },
      { call: 'loadLineItems' },
      { call: 'loadTasks' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'won', do: [{ call: 'markWon', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    { event: 'ui:click', ref: 'lost', do: [{ call: 'markLost', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    { event: 'ui:click', ref: 'add-task', do: [{ push: { action: 'tasks.form', canvas: 'modal', with: ['modal'], input: { deal_id: '$.record.deal_id' } } }] },
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'crm.deal.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit deal', confirmLabel: 'Save', id: '$.record.deal_id', title: '$.record.title', company: '$.record.company_id', stage: '$.record.stage_id', contact: '$.record.primary_contact_id', value: '$.record.value', close_date: '$.record.close_date' },
          },
        },
      ],
    },
    { message: 'deals-changed', do: [{ call: 'loadRecord' }] },
  ],
};

export const dealInputSchema = z.toJSONSchema(
  z.object({ id: z.string().describe('deal id (use find_records to resolve a name to an id)') }),
);
