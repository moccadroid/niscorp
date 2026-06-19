import type { CacheEntry } from './index';

// The sidebar nav badges — four COUNT(*)s in ONE read, not four. Each table's
// count is a single-row aggregate subquery; with no foreign key between them
// they cross-join into a single row { contacts, companies, deals, tasks }. The
// object shape makes Vex map that one row; the mapping returns it as-is.
export const sidebarCounts: CacheEntry = {
  intent: 'Sidebar nav badge counts — contacts, companies, deals, my open tasks',
  shape: { contacts: 0, companies: 0, deals: 0, tasks: 0 },
  dsl: {
    from: [
      { as: 'c', query: { from: ['contacts'], aggregate: { n: { count: '*' } } } },
      { as: 'co', query: { from: ['companies'], aggregate: { n: { count: '*' } } } },
      { as: 'd', query: { from: ['deals'], aggregate: { n: { count: '*' } } } },
      {
        as: 't',
        query: {
          from: ['tasks'],
          aggregate: { n: { count: '*' } },
          filter: { and: [{ eq: ['tasks.assignee_id', { $context: 'userId' }] }, { eq: ['tasks.done', false] }] },
        },
      },
    ],
    fields: [
      { field: 'c.n', as: 'contacts' },
      { field: 'co.n', as: 'companies' },
      { field: 'd.n', as: 'deals' },
      { field: 't.n', as: 'tasks' },
    ],
  },
  mapping: { $ref: '$.result' },
};
