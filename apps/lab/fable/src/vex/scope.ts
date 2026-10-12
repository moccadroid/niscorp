import type { ScopePolicy } from '@niscorp/vex';

// Fable is single-user with no identity in the data model, so the policy is
// open.
export const scopePolicy: ScopePolicy = {
  default: 'allow',
  entities: {},
};
