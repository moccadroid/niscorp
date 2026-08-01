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

// The desk's request seams.

// The board, scoped by the toolbar tab. One cached plan serves Open / Resolved /
// All through a status RANGE — Postgres orders text and 'open' sorts before
// 'resolved', so the bounds collapse the set without a second query.
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

// ─── movements, with the tab as the SET of states it means ───
// One key instead of three bounds, and it reads as the sentence a clerk would
// say: due in is arriving, in house is in house, all is both. `departed` is not
// absent because of an exclusion — it is absent because nobody asked for it.
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

// ─── the split issue surfaces ────────────────────────────────
// Each takes `issueId` and loads what it needs. That is the whole difference
// from the monolith: the subject arrives as INPUT, so a push, a link or the
// agent can aim one of these at a specific issue. The board could only ever be
// handed a property.
export const issueByIdPrism = { fingerprint: issueById.fingerprint, context: { issueId: { $ref: '$.issueId' } } };
export const issueTasksByIdPrism = { fingerprint: tasksForIssue.fingerprint, context: { issueId: { $ref: '$.issueId' } } };
export const resolveByIdPrism = {
  fingerprint: issueSetStatus.fingerprint,
  context: { issueId: { $ref: '$.issueId' }, status: 'resolved', resolvedAt: { $ref: '$.today' } },
};
// The dispatch form composes its docket title from the issue it loaded, so the
// row a clerk sees on the floor still reads like something a person wrote.
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

// Resolving an issue. `resolvedAt` is sent as the injected ambient date rather
// than a clock read anywhere in a layout or a transform.
export const resolveIssuePrism = {
  fingerprint: issueSetStatus.fingerprint,
  context: { issueId: { $ref: '$.openIssue.issue_id' }, status: 'resolved', resolvedAt: { $ref: '$.today' } },
};

// Dispatching work. The title is composed from the issue, so the task reads like
// something a person would write on a docket. `property_id` is stamped by scope.
export const dispatchPrism = {
  fingerprint: taskDispatch.fingerprint,
  context: {
    roomId: { $ref: '$.openIssue.room_id' },
    issueId: { $ref: '$.openIssue.issue_id' },
    title: { $join: { parts: [{ $ref: '$.openIssue.summary' }, ' — ', { $ref: '$.openIssue.room_number' }], sep: '' } },
    kind: { $ref: '$.dispatchKind' },
    // Empty means nobody has been chosen yet. A foreign key wants NULL for
    // that, not an empty string.
    assigneeId: { $case: { branches: [{ when: { $ref: '$.assigneeId' }, then: { $ref: '$.assigneeId' } }], else: null } },
  },
};

// Who is on the floor, for the dispatch picker.
export const staffPrism = { fingerprint: staffAtProperty.fingerprint, context: { propertyId: { $ref: '$.propertyId' } } };

// A guest's ask, sent to the floor. The room comes from the stay the card
// loaded, so the person picking it up knows where to go without opening
// anything; `assigneeId` falls back to null rather than '' because the column is
// a foreign key and an empty string is not a staff id.
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

// ─── guest management: one stay, the desk's hands on it ──────
export const guestIssuesPrism = { fingerprint: issuesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const deskCheckinPrism = { fingerprint: staySetCheckedIn.fingerprint, context: { stayId: { $ref: '$.stayId' }, checkedIn: true, state: 'in_house' } };
export const deskCheckoutPrism = { fingerprint: staySetDeparted.fingerprint, context: { stayId: { $ref: '$.stayId' }, state: 'departed', issued: false } };

// ─── the desk's message inbox ────────────────────────────────

// The feed of recent guest messages at this property.
export const inboxPrism = { fingerprint: messagesFeed.fingerprint, context: { propertyId: { $ref: '$.propertyId' } } };

// One stay's full thread, opened from the feed.
export const deskThreadPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.openStayId' } } };

// ─── the split message surfaces ──────────────────────────────
// Same change as the issue family: the stay is INPUT, so a thread can be opened
// by anything, and a reply can be pushed already carrying the words.
export const threadByStayPrism = { fingerprint: messagesForStay.fingerprint, context: { stayId: { $ref: '$.stayId' } } };
export const replyByStayPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.draft' } },
};

// The desk's reply. Same write as the guest's, but `sender` is 'desk' — so the
// guest's own thread shows it on the other side.
export const deskReplyPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.openStayId' }, sender: 'desk', body: { $ref: '$.draft' } },
};

// ─── who this is ─────────────────────────────────────────────
const byStay = (fingerprint: string) => ({ fingerprint, context: { stayId: { $ref: '$.stayId' } } });

export const guestByStayPrism = byStay(guestForStay.fingerprint);
export const notesByStayPrism = byStay(notesForStay.fingerprint);
export const folioTotalPrism = byStay(folioTotal.fingerprint);
export const transfersByStayPrism = byStay(transfersForStay.fingerprint);
export const goodwillByStayPrism = byStay(goodwillForStay.fingerprint);
// The visit count hangs off the GUEST, not the stay — so the brief loads the
// guest first and this reads from what came back. Two reads rather than one
// join, because "how many times has this person been here" is a question about
// a person and the surface was handed a reservation.
export const visitCountPrism = { fingerprint: stayVisitCount.fingerprint, context: { guestId: { $ref: '$.guest.guest_id' } } };

export const noteAddPrism = {
  fingerprint: noteAdd.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, kind: { $ref: '$.kind' }, body: { $ref: '$.body' }, author: { $ref: '$.author' } },
};

// ─── the stall list ──────────────────────────────────────────
const atProperty = (fingerprint: string) => ({ fingerprint, context: { propertyId: { $ref: '$.propertyId' } } });

export const waitingPrism = atProperty(messagesWaiting.fingerprint);
export const unattendedPrism = atProperty(issuesUnattended.fingerprint);
export const dueInPrism = atProperty(staysDueIn.fingerprint);
export const notReadyPrism = atProperty(opsNotReady.fingerprint);
export const frontOfficePrism = atProperty(tasksFrontOffice.fingerprint);
// '%' is every pending ask. The attention queue wants all of them; the approvals
// surface narrows to one by passing its id instead.
export const pendingPrism = { fingerprint: 'requests/pending', context: { requestId: '%' } };

// Which desk surface answers an approval here. Both capabilities are asked for
// together because one screen usually serves both, and the answer is a live slot
// at this property rather than a name core is allowed to know.
export const answeringPrism = {
  fingerprint: surfaceServing.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, capabilities: ['upgrade.offer', 'checkout.late'] },
};

// ─── moving a guest ──────────────────────────────────────────
// The candidates, in one read. `kind` is an ILIKE the surface fills: '%' asks
// for anything at all, the guest's own class asks for a move that is not a
// downgrade. Who is already in a room is a NOT EXISTS inside the query.
export const freeRoomsPrism = {
  fingerprint: roomsFree.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, kind: { $ref: '$.kindFilter' } },
};
export const moveStayPrism = { fingerprint: staySetRoom.fingerprint, context: { stayId: { $ref: '$.stayId' }, roomId: { $ref: '$.chosen.room_id' } } };
// The room they are leaving needs turning, and the one they are walking into
// stops being sellable to anybody else. Two writes, both mechanical.
export const soilOldRoomPrism = { fingerprint: roomSetStatus.fingerprint, context: { roomId: { $ref: '$.stay.room_id' }, status: 'dirty' } };
export const claimNewRoomPrism = { fingerprint: roomSetStatus.fingerprint, context: { roomId: { $ref: '$.chosen.room_id' }, status: 'clean' } };
export const moveTellPrism = {
  fingerprint: messageSend.fingerprint,
  context: { stayId: { $ref: '$.stayId' }, sender: 'desk', body: { $ref: '$.tell' } },
};

// ─── the room board ──────────────────────────────────────────
// The tab, as a status range. 'clean' < 'dirty' < 'inspected' < 'out_of_order'
// in text order, so bounds collapse the set and the layout filters nothing.
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

// ─── who is walking in ───────────────────────────────────────
export const groupPrism = { fingerprint: groupById.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
export const groupStaysPrism = { fingerprint: staysInGroup.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
export const groupReadyPrism = { fingerprint: staysInGroupReady.fingerprint, context: { groupId: { $ref: '$.groupId' } } };
// The set the read above decided. Nothing in the layout or the trigger knows the
// rule about a room having to be signed off — it only passes on the answer.
export const groupCheckInPrism = { fingerprint: stayCheckInMany.fingerprint, context: { stayIds: { $ref: '$.ready' } } };

// The state of the room a stay is standing in. `stay/byId` carries the number;
// an arrival needs to know whether anybody has signed it off, and that comes
// from the room the stay it just loaded points at.
export const roomByStayPrism = { fingerprint: roomById.fingerprint, context: { roomId: { $ref: '$.stay.room_id' } } };

export const requestsByStayPrism = { fingerprint: 'requests/forStay', context: { stayId: { $ref: '$.stayId' } } };

// ─── handing on ──────────────────────────────────────────────
export const handoversPrism = atProperty(handoversRecent.fingerprint);
export const handoverWritePrism = {
  fingerprint: handoverWrite.fingerprint,
  context: { authorId: { $ref: '$.staffId' }, shift: { $ref: '$.shift' }, body: { $ref: '$.body' } },
};

// ─── handing over to a person ────────────────────────────────
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

