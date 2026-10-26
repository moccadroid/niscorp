import { personInvite } from '../../vex/people.entries';

export const invitePrism = {
  fingerprint: personInvite.fingerprint,
  context: { email: { $lower: { $trim: { $ref: '$.email' } } }, name: { $trim: { $ref: '$.name' } } },
};
