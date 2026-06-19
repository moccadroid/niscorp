import type { CacheEntry } from './index';

// The command-palette search — `action_id` aliased; the rows already match the
// shape, so no mapping.
export const actionsSearch: CacheEntry = {
  intent: 'Search the action catalog by name or description',
  shape: [{ action_id: '', name: '', description: '', kind: '' }],
  dsl: {
    from: ['actions'],
    fields: [{ field: 'actions.id', as: 'action_id' }, 'actions.name', 'actions.description', 'actions.kind'],
    filter: {
      or: [
        { ilike: ['actions.name', { $context: 'q' }] },
        { ilike: ['actions.description', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'actions.name', dir: 'asc' }],
    limit: 8,
  },
};
