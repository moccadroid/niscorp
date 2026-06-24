import type { ActionDefinition } from '@niscorp/nova';
import { homeLayout } from './home.layout';

// On mount, loads the dashboard aggregates via the `loadHome` function into
// `$.dash`, then clears `loading`.
export const homeAction: ActionDefinition = {
  id: 'home',
  data: { dash: { open: {}, won: {}, tasks: {}, stages: [] }, loading: true },
  layout: homeLayout,
  // Each KPI + the by-stage table is its own read into a slot of `$.dash`.
  endpoints: {
    loadOpen: { fn: 'home.open', target: 'dash.open' },
    loadWon: { fn: 'home.won', target: 'dash.won' },
    loadTasks: { fn: 'home.tasks', target: 'dash.tasks' },
    loadStages: { fn: 'home.stages', target: 'dash.stages' },
  },
  lifecycle: { mount: [{ call: 'loadOpen', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadWon' }, { call: 'loadTasks' }, { call: 'loadStages' }] },
  // From the dashboard, + New quick-adds a deal (the form defaults to create).
  triggers: [{ message: 'new', do: [{ push: { action: 'deal.form', canvas: 'modal', with: ['modal'] } }] }],
};
