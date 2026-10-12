import type { ScopeBehaviors } from '@niscorp/vex';

// Not access control: the charter decides whether a principal has a read or
// write phase. A granted table with no entry here runs with no rules.
export const scopeBehaviors: ScopeBehaviors = {
  // companies, contacts and deals carry no behaviors: they are shared by the
  // team, and a `set` on owner_id would reassign the owner on every edit.
  tasks: {
    read: [{ match: 'assignee_id', to: 'userId' }],
    write: [
      { set: 'assignee_id', to: 'userId' },
      { match: 'assignee_id', to: 'userId' },
    ],
  },
};
