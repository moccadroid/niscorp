import { stayById, folioForStay, folioTotal, messagesForStay, messageSend, staySetKey, staySetCheckedIn, staySetDeparted } from '@atrium/app/vex/stay.entries';
import { issuesForStay, issueRaise } from '@atrium/app/vex/service.entries';
import { requestOptions } from '@atrium/app/vex/catalog.entries';

export const stayDetailPrism = { fingerprint: stayById.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const folioPrism = { fingerprint: folioForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const folioTotalPrism = { fingerprint: folioTotal.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const threadPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const stayIssuesPrism = { fingerprint: issuesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };

export const requestOptionsPrism = {
  fingerprint: requestOptions.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, capabilityId: { $ref: '$.capability' } },
};

export const sendMessagePrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'guest', body: { $ref: '$.draft' } },
};

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
