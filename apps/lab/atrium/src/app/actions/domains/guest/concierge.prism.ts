import { stayCurrent } from '@atrium/app/vex/stay.entries';
import { surfaceLive } from '@atrium/app/vex/surface.entries';

// moss injects the session's principal as `$.userId`; principal ids are guest
// ids.
export const currentStayPrism = {
  fingerprint: stayCurrent.fingerprint,
  context: { guestId: { $ref: '$.userId' } },
};

export const liveSlotsPrism = {
  fingerprint: surfaceLive.fingerprint,
  context: {
    propertyId: { $ref: '$.stay.property_id' },
    audience: 'guest',
    stayState: { $ref: '$.stay.state' },
  },
};
