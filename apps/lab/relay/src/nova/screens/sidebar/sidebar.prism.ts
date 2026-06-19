import { sidebarCounts } from '@relay/api/counts';

// The nav badges are one COUNT(*)-per-table read, cross-joined into a single
// row { contacts, companies, deals, tasks }. One request fills all four slots;
// the layout binds each directly. `userId` scopes the "my open tasks" count.
export const sidebarPrism: Record<string, unknown> = {
  'sidebar.counts': { shape: { $const: sidebarCounts.shape }, context: { userId: { $ref: '$.userId' } } },
};
