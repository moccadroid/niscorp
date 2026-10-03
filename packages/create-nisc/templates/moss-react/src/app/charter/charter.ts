import type { Charter } from '@niscorp/charter';

// The policy document: role names → the action ids that exist for them (and,
// once there is data, `data: ['table.verb', …]`). `public` is whoever has not
// signed in — today, everybody.
export const charter: Charter = {
  public: ['welcome'],
};
