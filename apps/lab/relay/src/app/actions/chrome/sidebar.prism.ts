import { sidebarCounts } from '@relay/app/vex/counts.entries';

export const sidebarCountsPrism = { fingerprint: sidebarCounts.fingerprint, context: { userId: { $ref: '$.userId' } } };
