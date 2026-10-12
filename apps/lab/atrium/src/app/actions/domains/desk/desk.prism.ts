import { issuesBoard, issueById, issueSetStatus, taskDispatch, taskRequest, tasksForIssue, issuesForStay, opsNotReady, roomsForProperty, roomById, roomsFree, roomSetStatus, staySetRoom } from '@atrium/app/vex/service.entries';
import { staysMovements, stayById, staySetKey, staySetCheckedIn, staySetDeparted, messagesFeed, messagesForStay, messageSend, folioTotal, transfersForStay } from '@atrium/app/vex/stay.entries';
import { staffAtProperty } from '@atrium/app/vex/service.entries';
import { surfaceServing } from '@atrium/app/vex/surface.entries';
import {
  guestForStay,
  notesForStay,
  noteAdd,
  stayVisitCount,
  messagesWaiting,
  issuesUnattended,
  staysDueIn,
  staysInGroup,
  staysInGroupReady,
  stayCheckInMany,
  groupById,
  handoversRecent,
  handoverWrite,
  staysMovementsToday,
  goodwillForStay,
  escalationRaise,
  tasksFrontOffice,
} from '@atrium/app/vex/desk.entries';

// The tab is a status range: Postgres orders text and 'open' sorts before
// 'resolved', so one cached plan serves Open, Resolved and All.
export const boardPrism = {
  fingerprint: issuesBoard.fingerprint,
  context: {
    propertyId: { $ref: '$.propertyId' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    statusMin: { $case: { branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'resolved'] }, then: 'resolved' }], else: 'open' } },
    statusMax: {
      $case: {
        branches: [
          { when: { $eq: [{ $ref: '$.scope' }, 'open'] }, then: 'open' },
          { when: { $eq: [{ $ref: '$.scope' }, 'resolved'] }, then: 'resolved' },
        ],
        else: 'resolved',
      },
    },
  },
};

export const movementsPrism = {
  fingerprint: staysMovements.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } },
};

export const movementsTodayPrism = {
  fingerprint: staysMovementsToday.fingerprint,
  context: {
    propertyId: { $ref: '$.propertyId' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    states: {
      $case: {
        branches: [
          { when: { $eq: [{ $ref: '$.scope' }, 'due'] }, then: ['arriving'] },
          { when: { $eq: [{ $ref: '$.scope' }, 'staying'] }, then: ['in_house'] },
        ],
        else: ['arriving', 'in_house'],
      },
    },
  },
};

export const deskStayPrism = { fingerprint: stayById.fingerprint, context: { stayId: { $ref: '$.stayId' } } };

export const issueByIdPrism = { fingerprint: issueById.fingerprint, context: { issueId: { $ref: '$.issueId' } } };
export const issueTasksByIdPrism = { fingerprint: tasksForIssue.fingerprint, context: { issueId: { $ref: '$.issueId' } } };
export const resolveByIdPrism = {
  fingerprint: issueSetStatus.fingerprint,
  context: { issueId: { $ref: '$.issueId' }, status: 'resolved', resolvedAt: { $ref: '$.today' } },
};
export const dispatchByIdPrism = {
  fingerprint: taskDispatch.fingerprint,
  context: {
    roomId: { $ref: '$.issue.room_id' },
    issueId: { $ref: '$.issueId' },
    title: { $join: { parts: [{ $ref: '$.issue.summary' }, ' — ', { $ref: '$.issue.room_number' }], sep: '' } },
    kind: { $ref: '$.kind' },
    assigneeId: { $case: { branches: [{ when: { $ref: '$.assigneeId' }, then: { $ref: '$.assigneeId' } }], else: null } },
  },
};

export const issueTasksPrism = { fingerprint: tasksForIssue.fingerprint, context: { issueId: { $ref: '$.openIssue.issue_id' } } };

export const resolveIssuePrism = {
  fingerprint: issueSetStatus.fingerprint,
  context: { issueId: { $ref: '$.openIssue.issue_id' }, status: 'resolved', resolvedAt: { $ref: '$.today' } },
};

export const dispatchPrism = {
  fingerprint: taskDispatch.fingerprint,
  context: {
    roomId: { $ref: '$.openIssue.room_id' },
    issueId: { $ref: '$.openIssue.issue_id' },
    title: { $join: { parts: [{ $ref: '$.openIssue.summary' }, ' — ', { $ref: '$.openIssue.room_number' }], sep: '' } },
    kind: { $ref: '$.dispatchKind' },
    // Empty means nobody is chosen; the foreign key needs NULL, not ''.
    assigneeId: { $case: { branches: [{ when: { $ref: '$.assigneeId' }, then: { $ref: '$.assigneeId' } }], else: null } },
  },
};

export const staffPrism = { fingerprint: staffAtProperty.fingerprint, context: { propertyId: { $ref: '$.propertyId' } } };

export const requestSendPrism = {
  fingerprint: taskRequest.fingerprint,
  context: {
    stayId: { $ref: '$.stayId' },
    roomId: { $ref: '$.stay.room_id' },
    title: { $ref: '$.title' },
    detail: { $ref: '$.detail' },
    kind: { $ref: '$.kind' },
    assigneeId: { $case: { branches: [{ when: { $ref: '$.assigneeId' }, then: { $ref: '$.assigneeId' } }], else: null } },
  },
};

export const deskKeyPrism = { fingerprint: staySetKey.fingerprint, context: { stayId: { $ref: '$.stayId' }, issued: true } };

export const guestIssuesPrism = { fingerprint: issuesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const deskCheckinPrism = { fingerprint: staySetCheckedIn.fingerprint, context: { stayId: { $ref: '$.stayId' }, checkedIn: true, state: 'in_house' } };
export const deskCheckoutPrism = { fingerprint: staySetDeparted.fingerprint, context: { stayId: { $ref: '$.stayId' }, state: 'departed', issued: false } };

export const inboxPrism = { fingerprint: messagesFeed.fingerprint, context: { propertyId: { $ref: '$.propertyId' } } };

export const deskThreadPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.openStayId' } } };

export const threadByStayPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const replyByStayPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.draft' } },
};

export const deskReplyPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.openStayId' }, sender: 'desk', body: { $ref: '$.draft' } },
};

const byStay = (fingerprint: string) => ({ fingerprint, context: { stayId: { $ref: '$.stayId' } } });

export const guestByStayPrism = byStay(guestForStay.fingerprint);
export const notesByStayPrism = byStay(notesForStay.fingerprint);
export const folioTotalPrism = byStay(folioTotal.fingerprint);
export const transfersByStayPrism = byStay(transfersForStay.fingerprint);
export const goodwillByStayPrism = byStay(goodwillForStay.fingerprint);
export const visitCountPrism = { fingerprint: stayVisitCount.fingerprint, context: { guestId: { $ref: '$.guest.guest_id' } } };

export const noteAddPrism = {
  fingerprint: noteAdd.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, kind: { $ref: '$.kind' }, body: { $ref: '$.body' }, author: { $ref: '$.author' } },
};

const atProperty = (fingerprint: string) => ({ fingerprint, context: { propertyId: { $ref: '$.propertyId' } } });

export const waitingPrism = atProperty(messagesWaiting.fingerprint);
export const unattendedPrism = atProperty(issuesUnattended.fingerprint);
export const dueInPrism = atProperty(staysDueIn.fingerprint);
export const notReadyPrism = atProperty(opsNotReady.fingerprint);
export const frontOfficePrism = atProperty(tasksFrontOffice.fingerprint);
// '%' is every pending request.
export const pendingPrism = { fingerprint: 'requests/pending', context: { requestId: '%' } };

export const answeringPrism = {
  fingerprint: surfaceServing.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, capabilities: ['upgrade.offer', 'checkout.late'] },
};

export const freeRoomsPrism = {
  fingerprint: roomsFree.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, kind: { $ref: '$.kindFilter' } },
};
export const moveStayPrism = { fingerprint: staySetRoom.fingerprint, context: { stayId: { $ref: '$.stayId' }, roomId: { $ref: '$.chosen.room_id' } } };
// The room they leave needs turning; 'clean' stops the room they move into
// being sellable to anybody else.
export const soilOldRoomPrism = { fingerprint: roomSetStatus.fingerprint, context: { roomId: { $ref: '$.stay.room_id' }, status: 'dirty' } };
export const claimNewRoomPrism = { fingerprint: roomSetStatus.fingerprint, context: { roomId: { $ref: '$.chosen.room_id' }, status: 'clean' } };
export const moveTellPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.tell' } },
};

export const roomsPrism = {
  fingerprint: roomsForProperty.fingerprint,
  context: {
    propertyId: { $ref: '$.propertyId' },
    statuses: {
      $case: {
        branches: [
          { when: { $eq: [{ $ref: '$.scope' }, 'ready'] }, then: ['inspected'] },
          { when: { $eq: [{ $ref: '$.scope' }, 'turning'] }, then: ['dirty'] },
        ],
        else: ['clean', 'dirty', 'inspected', 'out_of_order'],
      },
    },
  },
};
export const roomStatusPrism = { fingerprint: roomSetStatus.fingerprint, context: { roomId: { $ref: '$.markRoomId' }, status: { $ref: '$.markStatus' } } };

export const groupPrism = { fingerprint: groupById.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
export const groupStaysPrism = { fingerprint: staysInGroup.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
export const groupReadyPrism = { fingerprint: staysInGroupReady.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
export const groupCheckInPrism = { fingerprint: stayCheckInMany.fingerprint, context: { stayIds: { $ref: '$.ready' } } };

export const roomByStayPrism = { fingerprint: roomById.fingerprint, context: { roomId: { $ref: '$.stay.room_id' } } };

export const requestsByStayPrism = { fingerprint: 'requests/forStay', context: { stayId: { $ref: '$.stayId' } } };

export const handoversPrism = atProperty(handoversRecent.fingerprint);
export const handoverWritePrism = {
  fingerprint: handoverWrite.fingerprint,
  context: { authorId: { $ref: '$.staffId' }, shift: { $ref: '$.shift' }, body: { $ref: '$.body' } },
};

export const escalatePrism = {
  fingerprint: escalationRaise.fingerprint,
  context: {
    stayId: { $case: { branches: [{ when: { $ref: '$.stayId' }, then: { $ref: '$.stayId' } }], else: null } },
    issueId: { $case: { branches: [{ when: { $ref: '$.issueId' }, then: { $ref: '$.issueId' } }], else: null } },
    roomId: { $case: { branches: [{ when: { $ref: '$.roomId' }, then: { $ref: '$.roomId' } }], else: null } },
    title: { $ref: '$.title' },
    detail: { $ref: '$.detail' },
    assigneeId: { $ref: '$.assigneeId' },
  },
};

