import type { Charter } from '@niscorp/charter';

// `public: []` is the authentication: an anonymous principal resolves to no
// actions, so moss builds a shell with nothing in it.
export const ADMIN_CHARTER: Charter = {
  public: [],
  operator: {
    actions: ['admin.*'],
    functions: ['admin.capabilities', 'admin.catalog', 'admin.charter', 'admin.definition', 'admin.entries', 'admin.explain', 'admin.holders', 'admin.preview', 'admin.resetShell', 'admin.runs', 'admin.setCapability', 'admin.setSlot', 'admin.shells', 'admin.surface', 'admin.sync', 'admin.timeline'],
  },
};

export const ADMIN_ASSIGNMENTS: Record<string, readonly string[]> = {
  op_atrium: ['operator'],
};
