import type { Charter } from '@niscorp/charter';

export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: {
    actions: ['admin.*'],
    functions: ['admin.integrations.announce', 'admin.integrations.approve', 'admin.integrations.list', 'admin.integrations.probe', 'admin.integrations.remove'],
  },
};

export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_lyra: ['operator'],
};
