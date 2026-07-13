import type { ScopePolicy } from '@niscorp/vex';

// Fable is single-user with no identity in the data model, so the policy is
// open — but it is still wired through the engine, because that is where
// access policy lives: engine-side, invisible to and unforgeable by query
// authors. The day todos grow an owner, the stamp goes here, not in a form.
export const scopePolicy: ScopePolicy = {
  default: 'allow',
  entities: {},
};
