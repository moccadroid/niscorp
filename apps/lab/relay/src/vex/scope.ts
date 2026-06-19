import type { ScopePolicy } from '@niscorp/vex';

// Server-side, LLM-invisible access control. Two roles per table (see the Vex
// scope docs): `match` = RLS WHERE/pin, `set` = identity stamp on INSERT. Both
// are applied by the engine AFTER the DSL is authored, so a generated/injected
// mutation can't forge them.
//
// v1 is single-user with open reads (`default: 'allow'`, no `read` rules → every
// query runs unfiltered). The one rule we carry is a WRITE `set`: every created
// row is stamped with its creator. owner_id / assignee_id are server-set from
// the signed-in user — never client-supplied. When Relay grows tenants/roles,
// add `read`/`write` `match` rules here (e.g. account_id) and reads + writes get
// scoped with no change to the views, actions, or mutation entries.
//
// Note: "my deals" / "my tasks" filter by the current user via a `$context` ref
// in the query itself, NOT scope — context is "a subset I'm allowed to see
// anyway"; scope is the hard, unforgeable boundary.
export const scopePolicy: ScopePolicy = {
  default: 'allow',
  entities: {
    contacts: { write: [{ set: 'owner_id', to: 'userId' }] },
    companies: { write: [{ set: 'owner_id', to: 'userId' }] },
    deals: { write: [{ set: 'owner_id', to: 'userId' }] },
    tasks: { write: [{ set: 'assignee_id', to: 'userId' }] },
  },
};
