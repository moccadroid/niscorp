import { sidebarCounts } from '@relay/app/vex/counts.entries';

// The nav badges are one COUNT(*)-per-table read, cross-joined into a single
// row { contacts, companies, deals, tasks }. One request fills all four slots;
// the layout binds each directly. `userId` scopes the "my open tasks" count. A
// full Vex query body, attached to the endpoint's `request`.
export const sidebarCountsPrism = { fingerprint: sidebarCounts.fingerprint, context: { userId: { $ref: '$.userId' } } };
