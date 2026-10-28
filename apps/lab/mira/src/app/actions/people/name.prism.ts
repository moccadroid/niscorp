import { personName } from '../../vex/people.entries';

export const namePrism = {
  fingerprint: personName.fingerprint,
  context: { id: { $ref: '$.me.id' }, name: { $trim: { $ref: '$.name' } } },
};
