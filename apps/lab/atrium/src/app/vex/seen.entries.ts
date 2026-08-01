import type { CacheEntry, MutationEntry } from './index';

// Unread, without a push: the latest seen-mark is the threshold, anything newer
// counts. Two reads chained by the caller (mark → count with `since`), because
// the threshold is the CALLER's own row — scope pins `seen_marks` to them, so
// no user id ever travels.

// The caller's latest mark for a topic. Seeded at epoch for everyone, so the
// max always exists and a fresh account correctly sees history as unread.
export const seenLast: CacheEntry = {
  fingerprint: 'seen/last',
  intent: "The caller's latest seen-mark for a topic",
  shape: { last: '' },
  dsl: {
    from: ['seen_marks'],
    aggregate: { last: { max: 'seen_marks.seen_at' } },
    filter: { eq: ['seen_marks.topic', { $context: 'topic' }] },
  },
  mapping: { $ref: '$.result' },
};

// The desk's unread: anything at the property NOT sent by the desk, newer than
// `since`. Guests' words and their assistants' handoffs both count — the desk
// needs to see both.
export const unreadForDesk: CacheEntry = {
  fingerprint: 'messages/unreadForDesk',
  intent: 'Count of messages from guests or their assistants newer than a threshold',
  shape: { count: 0 },
  dsl: {
    from: ['messages'],
    aggregate: { count: { count: '*' } },
    filter: {
      and: [
        { neq: ['messages.sender', 'desk'] },
        { gt: ['messages.sent_at', { $context: 'since' }] },
      ],
    },
  },
  mapping: { $ref: '$.result' },
};

// The guest's unread: the DESK's replies on their stay, newer than `since`.
// Their own lines and their assistant's handoffs are their side — never unread.
export const unreadForStay: CacheEntry = {
  fingerprint: 'messages/unreadForStay',
  intent: "Count of desk messages on a stay newer than a threshold",
  shape: { count: 0 },
  dsl: {
    from: ['messages'],
    aggregate: { count: { count: '*' } },
    filter: {
      and: [
        { eq: ['messages.stay_id', { $context: 'stayId' }] },
        { eq: ['messages.sender', 'desk'] },
        { gt: ['messages.sent_at', { $context: 'since' }] },
      ],
    },
  },
  mapping: { $ref: '$.result' },
};

// Looking IS the write: opening the inbox or the thread appends a fresh mark.
// user and property are scope-stamped; append-only, the max wins.
export const seenMark: MutationEntry = {
  fingerprint: 'seen/mark',
  intent: 'Record that the caller has looked at a topic just now',
  mutation: {
    op: 'insert',
    table: 'seen_marks',
    values: { topic: { $context: 'topic' } },
  },
};
