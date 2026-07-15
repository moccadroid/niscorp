import type { Charter } from './types';

// Relay's charter — which actions exist for whom. Selections only: the
// charter never shapes an action (variants are distinct ids) and never does
// row/column work (that's vex scope policy, ring 3). The `dev` role is
// deliberately orthogonal — admin does not imply devtools. Agent roles
// (ray, agent-unsafe) return when the app server is up.
export const CHARTER: Charter = {
  public: ['auth.login'],
  member: ['chrome.*', 'home', 'placeholder', 'confirm-delete'],
  viewer: { extends: ['member'], allow: ['crm.contacts', 'crm.companies', 'crm.deals', 'crm.*.view'] },
  sales: { extends: ['viewer'], allow: ['crm.*', 'tasks.*', 'assistant', 'keys'] },
  admin: { extends: ['sales'], allow: ['settings'] },
  dev: ['devtools.*'],
};
