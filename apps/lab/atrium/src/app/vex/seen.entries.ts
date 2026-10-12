import type { CacheEntry, MutationEntry } from './index';

// Scope pins `seen_marks` to the caller, so no user id travels.

// A mark is seeded at epoch for everyone, so the max always exists.
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

export const seenMark: MutationEntry = {
  fingerprint: 'seen/mark',
  intent: 'Record that the caller has looked at a topic just now',
  mutation: {
    op: 'insert',
    table: 'seen_marks',
    values: { topic: { $context: 'topic' } },
  },
};
