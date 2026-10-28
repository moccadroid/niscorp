import type { Charter } from '@niscorp/charter';

export const charter: Charter = {
  public: { actions: ['signin.*'], data: [], functions: ['signin.request'] },

  member: {
    actions: ['ask.*', 'answer.*'],
    data: ['answers.read', 'answers.write.insert', 'answers.write.update'],
    functions: ['ask', 'screens.open', 'answers.back', 'answers.forward', 'answers.go', 'answers.current', 'answers.deck', 'answers.conversation'],
  },

  // `inviting`: the row rule a person the owner invites is written under (src/app/vex).
  owner: { extends: ['member'], actions: ['people.*'], data: ['people.read', 'people.write.insert'], scoping: 'inviting' },

  // Roles nobody wears, each granted exactly its job.
  identity: { data: ['people.read'] },
  gatekeeper: { data: ['links.write.insert', 'links.write.delete', 'people.write.insert'] },
};

export const WEARABLE: readonly (readonly string[])[] = [['public'], ['member'], ['owner']];
