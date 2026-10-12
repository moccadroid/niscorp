import type { CacheEntry } from './index';

export const actionsSearch: CacheEntry = {
  fingerprint: 'actions/search',
  intent: 'Search the granted action catalog by name or description',
  shape: [{ action_id: '', name: '', description: '', kind: '' }],
  dsl: {
    from: ['actions'],
    fields: [{ field: 'actions.id', as: 'action_id' }, 'actions.name', 'actions.description', 'actions.kind'],
    filter: {
      and: [
        { in: ['actions.id', { $context: 'allowedIds' }] },
        { or: [{ ilike: ['actions.name', { $context: 'q' }] }, { ilike: ['actions.description', { $context: 'q' }] }] },
      ],
    },
    sort: [{ field: 'actions.name', dir: 'asc' }],
    limit: 8,
  },
};
