import type { Charter } from '@niscorp/charter';

export const charter: Charter = {
  public: { actions: ['signin.*'], data: [], functions: ['signin.request'] },

  // `self`: their own row of `people` only (src/app/vex).
  member: {
    actions: ['ask.*', 'answer.*', 'people.me'],
    data: ['answers.read', 'answers.write.insert', 'answers.write.update', 'people.read', 'people.write.update'],
    functions: ['ask', 'screens.open', 'answers.back', 'answers.forward', 'answers.go', 'answers.current', 'answers.deck', 'answers.conversation', 'answers.close'],
    scoping: 'self',
  },

  // `inviting`: the row rule a person the owner invites is written under, and their own row the only one they change.
  owner: { extends: ['member'], actions: ['people.*'], data: ['people.write.insert'], scoping: 'inviting' },

  // Roles nobody wears, each granted exactly its job.
  identity: { data: ['people.read'] },
  gatekeeper: { data: ['links.write.insert', 'links.write.delete', 'people.write.insert'] },
};

export const WEARABLE: readonly (readonly string[])[] = [['public'], ['member'], ['owner']];
