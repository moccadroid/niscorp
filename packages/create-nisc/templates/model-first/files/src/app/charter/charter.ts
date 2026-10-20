import type { Charter } from '@niscorp/charter';

// Everybody is `public` until the app has a sign-in: they may ask, read the greetings and add one.
export const charter: Charter = {
  public: {
    actions: ['ask.*', 'answer.*', 'rows.*'],
    data: ['greetings.read', 'greetings.write.insert'],
    functions: ['ask', 'answers.back', 'answers.forward', 'answers.write'],
  },
};
