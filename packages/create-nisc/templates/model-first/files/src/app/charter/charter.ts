import type { Charter } from '@niscorp/charter';

// Everybody is `public` until the app has a sign-in.
export const charter: Charter = {
  public: {
    actions: ['ask.*', 'answer.*', 'guide.*'],
    data: ['packages.read'],
    functions: ['ask', 'screens.open'],
  },
};
