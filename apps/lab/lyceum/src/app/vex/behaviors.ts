import type { ScopeBehaviors } from '@niscorp/vex';

export const BEHAVIORS: ScopeBehaviors = {
  members: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
    personal: {
      insert: [{ set: 'member_id', to: 'userId' }],
      update: [{ match: 'member_id', to: 'userId' }],
    },
  },
  queries: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
  },
  // `room` is the speaker's reach: every question, to read.
  questions: {
    default: {
      insert: [{ set: 'member_id', to: 'userId' }],
      read: [{ match: 'member_id', to: 'userId' }],
    },
    room: {},
  },
  // `fitToShow` is a constant every principal's scope carries, so the engine
  // adds `appropriate = true` to every read the stage makes, whatever an
  // action asks for.
  question_verdicts: {
    default: {},
    stage: { read: [{ match: 'appropriate', to: 'fitToShow' }] },
    // A phone given the Q&A sees the same: only what the moderator let through.
    audience: { read: [{ match: 'appropriate', to: 'fitToShow' }] },
  },
  member_renderers: {
    default: {
      read: [{ match: 'member_id', to: 'userId' }],
      insert: [{ set: 'member_id', to: 'userId' }],
      update: [{ match: 'member_id', to: 'userId' }],
    },
    stage: {},
  },
  claps: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
  },
  presses: {
    default: { insert: [{ set: 'member_id', to: 'userId' }] },
  },
  timers: {
    default: { insert: [{ set: 'saved_by', to: 'userId' }] },
  },
  assistant_turns: {
    default: {
      read: [{ match: 'member_id', to: 'userId' }],
      insert: [{ set: 'member_id', to: 'userId' }],
      update: [{ match: 'member_id', to: 'userId' }],
    },
  },
};
