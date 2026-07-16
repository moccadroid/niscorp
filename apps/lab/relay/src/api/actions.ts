import type { CacheEntry } from './index';

// The command-palette search — `action_id` aliased; the rows already match the
// shape, so no mapping. The catalog is the API: results are constrained to the
// principal's GRANTED action ids (`$context.allowedIds`, seeded into the topbar
// at boot from the resolved charter), so a viewer never sees create actions
// they can't reach — no matter what they type.
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
