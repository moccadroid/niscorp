import { createScopePolicy, handleQuery, mergeScopePolicies } from '@niscorp/vex';
import type { ExecuteRecord, MutationClient, QueryEngine, ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal, resolveScoping } from '@niscorp/charter';
import type { ResolvedIdentity } from '../identity';
import type { NiscApp } from '../manifest';

type Governed = Pick<NiscApp, 'charter' | 'behaviors'>;

export const resolvePolicyForRoles = (app: Governed, grants: readonly string[], roles: readonly string[]): ScopePolicy => {
  const behaviors = app.behaviors ?? {};
  // One policy per role, then merged: each role's rows are scoped by that
  // role's own reach, and the union is what somebody holding several may do.
  return mergeScopePolicies(
    roles.map((role) =>
      createScopePolicy(resolvePrincipal(app.charter, grants, [role], 'data'), behaviors, resolveScoping(app.charter, role)),
    ),
  );
};

export const resolvePolicyAtReachForRoles = (
  app: Governed,
  grants: readonly string[],
  roles: readonly string[],
  reach: string,
): ScopePolicy => createScopePolicy(resolvePrincipal(app.charter, grants, roles, 'data'), app.behaviors ?? {}, reach);

export type Policies = {
  of: (who: Pick<ResolvedIdentity, 'key' | 'roles'>) => ScopePolicy;
  atReach: (who: Pick<ResolvedIdentity, 'key' | 'roles'>, reach: string) => ScopePolicy;
  drop: () => void;
};

export const createPolicies = (config: {
  charter: NiscApp['charter'];
  behaviors?: NiscApp['behaviors'];
  grants: readonly string[];
}): Policies => {
  const { grants } = config;
  const governed: Governed = { charter: config.charter, behaviors: config.behaviors };

  const policies = new Map<string, ScopePolicy>();
  const reachPolicies = new Map<string, ScopePolicy>();

  return {
    of: (who) => {
      const hit = policies.get(who.key);
      if (hit !== undefined) return hit;
      const compiled = resolvePolicyForRoles(governed, grants, who.roles);
      policies.set(who.key, compiled);
      return compiled;
    },
    atReach: (who, reach) => {
      const key = `${who.key}\u0000${reach}`;
      const hit = reachPolicies.get(key);
      if (hit !== undefined) return hit;
      const compiled = resolvePolicyAtReachForRoles(governed, grants, who.roles, reach);
      reachPolicies.set(key, compiled);
      return compiled;
    },
    drop: () => {
      policies.clear();
      reachPolicies.clear();
    },
  };
};

export type ExecuteAs = (role: string, fingerprint: string, context: Record<string, unknown>, scope?: Record<string, unknown>) => Promise<unknown>;

export type ExecuteAsDeps = {
  engine: QueryEngine;
  db: MutationClient;
  policyFor: (roles: readonly string[]) => ScopePolicy;
  policyAtReach: (roles: readonly string[], reach: string) => ScopePolicy;
  onExecute?: (record: ExecuteRecord) => void;
};

export const createExecuteAs =
  (deps: ExecuteAsDeps): ExecuteAs =>
  async (role, fingerprint, context, scope = {}) => {
    const roles = [role];
    const policy = deps.policyFor(roles);
    const outcome = await handleQuery(
      {
        engine: deps.engine,
        locked: true,
        scopePolicy: policy,
        policyForReach: (reach) => deps.policyAtReach(roles, reach),
        mutations: { client: deps.db, policy },
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
