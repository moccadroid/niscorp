import { staffList, staffSetActive, staffSetRole } from '@lyra/app/vex/staff.entries';

// SORTING COSTS NO FINGERPRINT. `sortBy`/`sortDir` are reserved context keys:
// vex reads them straight into the ORDER BY instead of binding them as
// parameters, and resolves `sortBy` against the entry's own schema — so the
// allowlist is "a real column of a table this entry already joins", enforced
// by the resolver rather than by a list somebody has to maintain. An empty
// `sortBy` leaves the entry's authored order alone.
const sorted = {
  sortBy: { $ref: '$.sortBy' },
  sortDir: { $ref: '$.sortDir' },
};

// An empty box sends NOTHING, not a wildcard. `null` is how a prism says
// "absent" — it assembles a fixed object and cannot drop a key, and vex counts
// null as absent for optional keys precisely so this reads the way it looks.
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

// One write either way — see `plans.prism`. The row already knows which
// direction its menu item means, so the flag is a literal here rather than
// another piece of pending state.
export const staffDeactivatePrism = { fingerprint: staffSetActive.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' }, active: false } };
export const staffReactivatePrism = { fingerprint: staffSetActive.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' }, active: true } };
