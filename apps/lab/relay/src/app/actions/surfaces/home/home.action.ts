import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { homeLayout } from './home.layout';
import { dealsByStatus, dealsByStage } from '@relay/app/data/api/deals';
import { tasksOpenCount } from '@relay/app/data/api/tasks';

// On mount, loads the dashboard aggregates via the `loadHome` function into
// `$.dash`, then clears `loading`.
export const homeAction: ActionDefinition = {
  id: 'home',
  title: 'Home',
  data: { open: {}, won: {}, tasks: {}, stages: [], loading: true },
  layout: homeLayout,
  // Each KPI + the by-stage table is its own read into a top-level slot.
  // The bodies are plain JSON replays — nothing derives from state, so no
  // prism seam.
  endpoints: {
    loadOpen:   { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStatus.fingerprint, context: { status: 'open' } }, target: 'open' },
    loadWon:    { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStatus.fingerprint, context: { status: 'won' } }, target: 'won' },
    loadTasks:  { url: '/api/tasks/vex', method: 'POST', request: { fingerprint: tasksOpenCount.fingerprint, context: {} }, target: 'tasks' },
    loadStages: { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsByStage.fingerprint, context: {} }, target: 'stages' },
  },
  lifecycle: { mount: [{ call: 'loadOpen', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadWon' }, { call: 'loadTasks' }, { call: 'loadStages' }] },
  // From the dashboard, + New quick-adds a deal (the form defaults to create).
  triggers: [{ message: 'new', do: [{ push: { action: 'crm.deal.form', canvas: 'modal', with: ['modal'] } }] }],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const homeInputSchema = z.toJSONSchema(z.object({}));
