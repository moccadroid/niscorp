import type { Charter } from '@niscorp/charter';

// Everybody is `public` until the app has a sign-in.
export const charter: Charter = {
  public: {
    actions: ['ask.*', 'answer.*'],
    data: [],
    functions: ['ask', 'screens.open', 'answers.back', 'answers.forward', 'answers.go', 'answers.current'],
  },
};
