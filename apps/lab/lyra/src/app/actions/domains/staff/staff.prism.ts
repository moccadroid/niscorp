import { staffDeactivate, staffList, staffReactivate, staffSetRole } from '@lyra/app/vex/staff.entries';

export const staffListPrism = {
  fingerprint: staffList.fingerprint,
  context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } },
};

// The role is set from the REF that was pressed, not from anything the row
// carried — so a payload cannot ask for a role the screen does not offer, and
// the four roles on offer are the four the charter defines.
export const staffSetRolePrism = {
  fingerprint: staffSetRole.fingerprint,
  context: { staffId: { $ref: '$.pendingStaffId' }, role: { $ref: '$.pendingRole' } },
};

export const staffDeactivatePrism = { fingerprint: staffDeactivate.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' } } };
export const staffReactivatePrism = { fingerprint: staffReactivate.fingerprint, context: { staffId: { $ref: '$.pendingStaffId' } } };
