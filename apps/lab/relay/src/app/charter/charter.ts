import type { Charter } from '@niscorp/charter';

// The engine's own tables sit in the same database, so `*.read` reaches them,
// and moss's `integrations` holds integration key hashes, which are
// credentials. A deny does not inherit, so every role that allows `*.read`
// denies these itself.
const ENGINE_TABLES = ['integrations.*', 'integration_actions.*', 'moss_generation.*', 'artifact_saves.*', 'artifacts.*', 'strata_ledger.*', 'vex_cache.*'];

export const CHARTER: Charter = {
  public: { actions: ['auth.login'], functions: ['auth.redeem', 'auth.sendLink'] },
  member: {
    actions: ['chrome.*', 'home', 'placeholder', 'confirm-delete', 'settings'],
    functions: ['auth.signOut', 'devtools.enabled', 'devtools.setEnabled', 'models.assign', 'models.load', 'ray.clearSessions', 'ray.getDebug', 'ray.setDebug', 'ray.storageSize'],
  },
  viewer: {
    extends: ['member'],
    actions: ['crm.contacts', 'crm.companies', 'crm.deals', 'crm.*.view'],
    data: { allow: ['*.read'], deny: ENGINE_TABLES },
  },
  sales: {
    functions: ['ray.load', 'ray.newSession', 'ray.run', 'ray.stop', 'ray.switch'],
    extends: ['viewer'],
    actions: ['crm.*', 'tasks.*', 'assistant'],
    layouts: ['chrome.topbar.full'],
    data: [
      'deals.write.insert', 'deals.write.update',
      'contacts.write.insert', 'contacts.write.update',
      'companies.write.insert', 'companies.write.update',
      'tasks.write.*',
    ],
  },
  admin: {
    extends: ['sales'],
    data: ['deals.write.delete', 'contacts.write.delete', 'companies.write.delete'],
  },
  dev: { actions: ['devtools.*'], functions: ['devtools.audit', 'devtools.describe', 'devtools.pop', 'devtools.shellState', 'devtools.timeline'] },
  // The engine's own principal, never assigned to a human. Its reads include
  // model-written queries, so the engine's tables are denied here too.
  system: { data: { allow: ['*.read', 'deals.write.*', 'contacts.write.*', 'companies.write.*', 'tasks.write.*'], deny: ENGINE_TABLES } },
};
