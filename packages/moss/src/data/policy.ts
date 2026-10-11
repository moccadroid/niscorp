import { createScopePolicy, mergeScopePolicies } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal, resolveScoping } from '@niscorp/charter';
import type { ResolvedIdentity } from '../identity';
import type { NiscApp } from '../manifest';

// ═══════════════════════════════════════════════════════════════
// THE POLICY A SET OF ROLES READS AND WRITES UNDER — the compiled vex
// ScopePolicy. The compilations are pure; `createPolicies` below keeps what
// they answer. Who somebody is belongs to ../identity; the granted action ids
// and the layout variants a set of roles holds are ../manifest's.
// ═══════════════════════════════════════════════════════════════

// What a policy is compiled from, of the manifest: the charter and the row
// behaviors. Never the assignments: who somebody is, is asked of ../identity,
// and what reaches here is the roles they were resolved to.
type Governed = Pick<NiscApp, 'charter' | 'behaviors'>;

// THE COMPILED ScopePolicy A SET OF ROLES READS AND WRITES UNDER: their
// resolved `data` grants × the app's row behaviors. An ungranted phase is
// absent, and vex's default-deny refuses it.
//
// ONE POLICY PER ROLE, then merged — because somebody may hold several, and
// reach belongs to the role rather than to the person. An instructor who also
// trains is staff on the roster and a member in the class, and no single reach
// describes both — studio-wide on the read they do as staff, their own rows on
// the write they do as a member. Per role, each with its own scoping, and the
// union is what they may do.
export const resolvePolicyForRoles = (app: Governed, grants: readonly string[], roles: readonly string[]): ScopePolicy => {
  const behaviors = app.behaviors ?? {};
  return mergeScopePolicies(
    roles.map((role) =>
      createScopePolicy(resolvePrincipal(app.charter, grants, [role], 'data'), behaviors, resolveScoping(app.charter, role)),
    ),
  );
};

// THE SAME ROLES, COMPILED AT A REACH THE READ DEMANDS.
//
// The merge above is a union, so a principal holding two roles reaches as wide
// as either grants. That is right for the roster somebody is paid to read and
// wrong for the screen that says "yours" — an instructor who also trains would
// read every booking at the studio under "what you have booked".
//
// So an entry may name a profile (`OkCacheEntry.reach`) and vex asks for the
// policy at that reach instead. GRANTS ARE UNCHANGED — the union of every role's
// verbs, so this can only narrow rows, never widen phases. A caller with no verb
// for the table is still refused.
export const resolvePolicyAtReachForRoles = (
  app: Governed,
  grants: readonly string[],
  roles: readonly string[],
  reach: string,
): ScopePolicy => createScopePolicy(resolvePrincipal(app.charter, grants, roles, 'data'), app.behaviors ?? {}, reach);

// WHAT EACH SET OF ROLES MAY READ AND WRITE, REMEMBERED.
//
// Compiled at first sight and kept: the documents are static until the
// manifest changes, and whoever owns these drops them then.
export type Policies = {
  // The policy somebody already resolved reads and writes under.
  of: (who: Pick<ResolvedIdentity, 'key' | 'roles'>) => ScopePolicy;
  // The same principal at a reach an ENTRY demands — same grants, narrower
  // rows.
  atReach: (who: Pick<ResolvedIdentity, 'key' | 'roles'>, reach: string) => ScopePolicy;
  drop: () => void;
};

export const createPolicies = (config: {
  // The charter and the row behaviors every policy is compiled from.
  charter: NiscApp['charter'];
  behaviors?: NiscApp['behaviors'];
  // every `<table>.<verb>` the database can carry
  grants: readonly string[];
}): Policies => {
  const { grants } = config;
  const governed: Governed = { charter: config.charter, behaviors: config.behaviors };

  // KEYED BY WHAT IT DEPENDS ON, not by who asked: a policy is a function of
  // the role combination, so two people on the same rung share one compiled
  // policy rather than holding a copy each.
  const policies = new Map<string, ScopePolicy>();
  // Memoized per (principal, reach) for the same reason the policy above is:
  // the documents are static for the process.
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
      // `reachPolicies` too: it is compiled from the same grants as `policies`
      // and goes stale with it.
      reachPolicies.clear();
    },
  };
};
