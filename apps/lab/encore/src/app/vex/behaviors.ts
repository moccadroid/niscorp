import type { ScopeBehaviors } from '@niscorp/vex';

// One festival, one tenant: no `match` on the festival's own tables. A `set`
// column is written by the engine from the session, whatever the request body says.
export const scopeBehaviors: ScopeBehaviors = {
  delays: { write: [{ set: 'created_by', to: 'userId' }] },
  pushes: { write: [{ set: 'created_by', to: 'userId' }] },
  attention_labels: {
    read: [{ match: 'principal', to: 'userId' }],
    write: [{ set: 'principal', to: 'userId' }],
  },
  agent_turns: {
    read: [{ match: 'principal', to: 'userId' }],
    write: [{ set: 'principal', to: 'userId' }],
  },
};
