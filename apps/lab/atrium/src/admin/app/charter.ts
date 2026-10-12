import type { Charter } from '@niscorp/charter';

// `public: []` is the authentication: an anonymous principal resolves to no
// actions, so moss builds a shell with nothing in it.
export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: { actions: ['admin.*'] },
};

export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_atrium: ['operator'],
};
