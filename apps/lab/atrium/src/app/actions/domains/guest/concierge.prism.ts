import { stayCurrent } from '@atrium/app/vex/stay.entries';
import { surfaceLive } from '@atrium/app/vex/surface.entries';

// The request seams for the guest's home. Each is a full Vex request body
// attached to an endpoint's `request`.

// `$.userId` is ambient — moss injects the session's principal into the
// transform source, and principal ids are guest ids. A guest cannot ask for
// somebody else's stay because the id was never theirs to send.
export const currentStayPrism = {
  fingerprint: stayCurrent.fingerprint,
  context: { guestId: { $ref: '$.userId' } },
};

// The resolution request. Both values come from the stay that was just loaded,
// not from boot input: when a guest checks in, the state changes and the surface
// re-resolves on the next read with no other moving part.
export const liveSlotsPrism = {
  fingerprint: surfaceLive.fingerprint,
  context: {
    propertyId: { $ref: '$.stay.property_id' },
    audience: 'guest',
    stayState: { $ref: '$.stay.state' },
  },
};
