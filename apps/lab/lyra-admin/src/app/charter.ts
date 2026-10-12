import type { Charter } from '@niscorp/charter';

export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: { actions: ['admin.*'] },
};

export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_lyra: ['operator'],
};
