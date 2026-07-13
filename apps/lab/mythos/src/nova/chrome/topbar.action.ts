import type { ActionDefinition } from '@niscorp/nova';
import { readEntries } from '../../api/reads';
import { DEFAULT_STATS, readEndpoint } from '../shared/endpoints';
import { streakFromDoneDays } from './topbar.prism';
import { topbarLayout } from './topbar.layout';

// The chrome: brand, Patch/Garden tabs (each replaces the main canvas),
// the mood chip, the daily combo meter, the streak chip, and the planting
// button. Listens on todos-changed like every other viewer.
export const topbar: ActionDefinition = {
  id: 'topbar',
  name: 'Topbar',
  description: 'App chrome: navigation tabs, mood chip, combo meter, streak, new-todo button.',
  data: {
    onPatch: true,
    onGarden: false,
    stats: DEFAULT_STATS,
    streak: 0,
  },
  endpoints: {
    loadStats: readEndpoint(readEntries.todoStats.fingerprint, 'stats'),
    loadStreak: {
      url: '/api/query',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: { fingerprint: readEntries.doneDays.fingerprint, context: {} },
      response: streakFromDoneDays,
      target: 'streak',
    },
  },
  lifecycle: {
    mount: [{ call: 'loadStats' }, { call: 'loadStreak' }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'nav-patch',
      do: [
        { set: 'onPatch', value: true },
        { set: 'onGarden', value: false },
        { replace: { action: 'todo-list', canvas: 'main' } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'nav-garden',
      do: [
        { set: 'onPatch', value: false },
        { set: 'onGarden', value: true },
        { replace: { action: 'todo-garden', canvas: 'main' } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'new-todo',
      do: [{ push: { action: 'todo-form', canvas: 'overlay', with: ['modal-frame'] } }],
    },
    { message: 'todos-changed', do: [{ call: 'loadStats' }, { call: 'loadStreak' }] },
  ],
  layout: topbarLayout,
};
