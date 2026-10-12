import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { homeLayout } from './home.layout';
import { dealsByStatus, dealsByStage } from '@relay/app/vex/deals.entries';
import { tasksOpenCount } from '@relay/app/vex/tasks.entries';

export const homeAction: ActionDefinition = {
  id: 'home',
  title: 'Home',
  data: { open: {}, won: {}, tasks: {}, stages: [], loading: true },
  layout: homeLayout,
  endpoints: {
    loadOpen:   { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStatus.fingerprint, context: { status: 'open' } }, target: 'open' },
    loadWon:    { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStatus.fingerprint, context: { status: 'won' } }, target: 'won' },
    loadTasks:  { url: '/api/tasks/vex', method: 'POST', request: { fingerprint: tasksOpenCount.fingerprint, context: {} }, target: 'tasks' },
    loadStages: { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStage.fingerprint, context: {} }, target: 'stages' },
  },
  lifecycle: { mount: [{ call: 'loadOpen', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadWon' }, { call: 'loadTasks' }, { call: 'loadStages' }] },
  triggers: [{ message: 'new', do: [{ push: { action: 'crm.deal.form', canvas: 'modal', with: ['modal'] } }] }],
};

export const homeInputSchema = z.toJSONSchema(z.object({}));
