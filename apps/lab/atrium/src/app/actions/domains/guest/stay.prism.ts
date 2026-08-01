import { stayById, folioForStay, folioTotal, messagesForStay, messageSend, staySetKey, staySetCheckedIn, staySetDeparted } from '@atrium/app/vex/stay.entries';
import { issuesForStay, issueRaise } from '@atrium/app/vex/service.entries';
import { requestOptions } from '@atrium/app/vex/catalog.entries';

// The request seams shared by the guest's stay actions. Every one of them
// is opened with `stayId` seeded from the session, so none of them needs to know
// who is asking — the shell already did.

export const stayDetailPrism = { fingerprint: stayById.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const folioPrism = { fingerprint: folioForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const folioTotalPrism = { fingerprint: folioTotal.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const threadPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const stayIssuesPrism = { fingerprint: issuesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };

// The request menu, resolved from whichever of the property's connectors
// provides this capability. `$.capability` is seeded when the request action is
// opened (the slot carries it) — so one action shows spa treatments, or
// housekeeping items, or ticket categories, purely by which capability it was
// opened for. No hardcoded menu anywhere.
export const requestOptionsPrism = {
  fingerprint: requestOptions.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, capabilityId: { $ref: '$.capability' } },
};

// A guest's message. `sender` is a constant on this seam, not a field: the guest
// surface can only ever post as the guest.
export const sendMessagePrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'guest', body: { $ref: '$.draft' } },
};

// A request becomes an issue on the desk's board. The guest names the thing
// (summary) and its category comes from the chosen option (kind). `property_id`
// is stamped by scope, so it is not sent here.
export const raiseRequestPrism = {
  fingerprint: issueRaise.fingerprint,
  context: {
    stayId: { $ref: '$.stayId' },
    roomId: { $ref: '$.stay.room_id' },
    kind: { $ref: '$.kind' },
    summary: { $ref: '$.summary' },
    detail: { $ref: '$.detail' },
    severity: 'normal',
    raisedBy: 'guest',
  },
};

export const issueKeyPrism = { fingerprint: staySetKey.fingerprint, context: { stayId: { $ref: '$.stayId' }, issued: true } };
export const checkInPrism = { fingerprint: staySetCheckedIn.fingerprint, context: { stayId: { $ref: '$.stayId' }, checkedIn: true, state: 'in_house' } };
export const checkOutPrism = { fingerprint: staySetDeparted.fingerprint, context: { stayId: { $ref: '$.stayId' }, state: 'departed', issued: false } };
