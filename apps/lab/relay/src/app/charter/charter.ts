import type { Charter } from '@niscorp/charter';

// Relay's charter — which actions exist for whom, and which data verbs each
// principal may exercise. Two sections, one grammar: `actions` selects Nova
// action ids, `data` selects vex verb leaves that vex's own
// `createScopePolicy` turns into a ScopePolicy. `extends` composes both sections at once.
//
// The `dev` role is deliberately orthogonal — admin does not imply devtools.
// Agent roles (ray, agent-unsafe) return when the app server is up.
export const CHARTER: Charter = {
  public: ['auth.login'],
  member: ['chrome.*', 'home', 'placeholder', 'confirm-delete'],
  viewer: {
    extends: ['member'],
    actions: ['crm.contacts', 'crm.companies', 'crm.deals', 'crm.*.view'],
    // Read everything — reference data and CRM records alike. No write phase
    // exists in a viewer's compiled policy, so vex refuses every mutation.
    data: ['*.read'],
  },
  sales: {
    extends: ['viewer'],
    actions: ['crm.*', 'tasks.*', 'assistant'],
    // Inherits `*.read` from viewer; adds create + edit on the CRM entities
    // and the full write namespace on tasks (personal rows, pinned to the
    // assignee). CRM delete is deliberately ABSENT — deleting shared records
    // is the admin's verb. Reference tables and activities stay read-only.
    data: [
      'deals.write.insert', 'deals.write.update',
      'contacts.write.insert', 'contacts.write.update',
      'companies.write.insert', 'companies.write.update',
      'tasks.write.*',
    ],
  },
  admin: {
    extends: ['sales'],
    actions: ['settings'],
    // The delete tier: shared CRM records die only by an admin's hand.
    data: ['deals.write.delete', 'contacts.write.delete', 'companies.write.delete'],
  },
  dev: ['devtools.*'],
  // The engine's own principal — the trusted path (dev checks, Ray's query
  // tool, the architect's generative reads). Never assigned to a human. The
  // charter owns the trusted floor too: all reads, the full write namespace
  // where a mutation surface exists; an unlisted verb dies even for the
  // engine.
  system: { data: ['*.read', 'deals.write.*', 'contacts.write.*', 'companies.write.*', 'tasks.write.*'] },
};
