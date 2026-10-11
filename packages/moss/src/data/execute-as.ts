import { handleQuery } from '@niscorp/vex';
import type { ExecuteRecord, MutationClient, QueryEngine, ScopePolicy } from '@niscorp/vex';

// The capability lent to no-principal machinery: execute a seeded entry as a
// declared charter role. See `createExecuteAs` for the four bounds on it.
export type ExecuteAs = (role: string, fingerprint: string, context: Record<string, unknown>, scope?: Record<string, unknown>) => Promise<unknown>;

export type ExecuteAsDeps = {
  engine: QueryEngine;
  // The client a seeded write is replayed on.
  db: MutationClient;
  // The policy a set of roles reads and writes under, and the same roles at a
  // reach an entry demands.
  policyFor: (roles: readonly string[]) => ScopePolicy;
  policyAtReach: (roles: readonly string[], reach: string) => ScopePolicy;
  // Told of each execution, as the routes' own executions are.
  onExecute?: (record: ExecuteRecord) => void;
};

// EXECUTE A SEEDED ENTRY AS A DECLARED CHARTER ROLE — the one mechanism for
// every surface that has no principal by nature: identity resolution, the
// sign-in credential, a mail provider's callback, the lab's picker.
//
// Four bounds: in-process only (never a route); locked to REPLAY (only seeded
// entries run — no caller-authored query); the policy is compiled from a
// charter role with declared grants and a declared reach, like any
// principal's; and the scope values are supplied by server code, never by a
// request. Widening what a machinery role can touch is a charter diff
// somebody reviews.
export const createExecuteAs =
  (deps: ExecuteAsDeps): ExecuteAs =>
  async (role, fingerprint, context, scope = {}) => {
    const roles = [role];
    // Asked for once: a read and a write are under the one policy.
    const policy = deps.policyFor(roles);
    const outcome = await handleQuery(
      {
        engine: deps.engine,
        locked: true,
        scopePolicy: policy,
        policyForReach: (reach) => deps.policyAtReach(roles, reach),
        // Mutation replay under the same role policy — write gates and scope
        // pins apply exactly as they would for a person.
        mutations: { client: deps.db, policy },
        // Machinery is observed too: a seeded entry run as a charter role is a
        // vex execution, and its scope carries no principal, so it reports as
        // `hasPrincipal: false` — which is the truth about it.
        ...(deps.onExecute !== undefined ? { onExecute: deps.onExecute } : {}),
      },
      { fingerprint, context },
      scope,
    );
    if (outcome.status !== 200) {
      console.error(`[moss:executeAs] "${fingerprint}" as "${role}" refused (${outcome.status})`, outcome.body);
      return undefined;
    }
    const body = outcome.body;
    return body !== null && typeof body === 'object' && 'result' in body ? body.result : undefined;
  };
