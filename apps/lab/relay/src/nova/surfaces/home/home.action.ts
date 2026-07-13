import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { homeLayout } from './home.layout';
import { homeOpenPrism, homeWonPrism, homeTasksPrism, homeStagesPrism } from './home.prism';
import { resultPrism } from '@relay/nova/shared/result.prism';

// On mount, loads the dashboard aggregates via the `loadHome` function into
// `$.dash`, then clears `loading`.
export const homeAction: ActionDefinition = {
  id: 'home',
  title: 'Home',
  data: { open: {}, won: {}, tasks: {}, stages: [], loading: true },
  layout: homeLayout,
  // Each KPI + the by-stage table is its own read into a top-level slot.
  endpoints: {
    loadOpen:   { url: '/api/deals/vex', method: 'POST', request: homeOpenPrism,   response: resultPrism, target: 'open' },
    loadWon:    { url: '/api/deals/vex', method: 'POST', request: homeWonPrism,    response: resultPrism, target: 'won' },
    loadTasks:  { url: '/api/tasks/vex', method: 'POST', request: homeTasksPrism,  response: resultPrism, target: 'tasks' },
    loadStages: { url: '/api/deals/vex', method: 'POST', request: homeStagesPrism, response: resultPrism, target: 'stages' },
  },
  lifecycle: { mount: [{ call: 'loadOpen', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadWon' }, { call: 'loadTasks' }, { call: 'loadStages' }] },
  // From the dashboard, + New quick-adds a deal (the form defaults to create).
  triggers: [{ message: 'new', do: [{ push: { action: 'deal.form', canvas: 'modal', with: ['modal'] } }] }],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const homeInputSchema = z.toJSONSchema(z.object({}));
