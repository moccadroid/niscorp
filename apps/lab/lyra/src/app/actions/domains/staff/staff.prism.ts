import { staffList, staffSetActive, staffSetRole } from '@lyra/app/vex/staff.entries';

// `sortBy`/`sortDir` are reserved context keys: vex reads them into the ORDER BY
// instead of binding them, and resolves `sortBy` against the entry's own
// schema. An empty `sortBy` leaves the entry's authored order alone.
const sorted = {
  sortBy: { $ref: '$.sortBy' },
  sortDir: { $ref: '$.sortDir' },
};

// Null sends no search: a prism assembles a fixed object and cannot drop a key,
// and vex counts null as absent for an optional key.
export const staffListPrism = {
  fingerprint: staffList.fingerprint,
  context: {
    q: {
      $case: {
        branches: [{ when: { $eq: [{ $ref: '$.search' }, ''] }, then: null }],
        else: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
      },
    },
    ...sorted,
  },
};

export const staffSetRolePrism = {
  fingerprint: staffSetRole.fingerprint,
  context: { staffId: { $ref: '$.pendingStaffId' }, role: { $ref: '$.pendingRole' } },
};

export const staffDeactivatePrism = { fingerprint: staffSetActive.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' }, active: false } };
export const staffReactivatePrism = { fingerprint: staffSetActive.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' }, active: true } };
