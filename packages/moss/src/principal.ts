import { createScopePolicy, mergeScopePolicies } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal, resolveScoping } from '@niscorp/charter';
import { assignedRoles, memoKey } from './identity';
import type { NiscApp } from './manifest';

// ═══════════════════════════════════════════════════════════════
// Per-principal resolution, the policy half: roles from the assignment
// rows, and the compiled vex ScopePolicy. All pure; the server memoizes
// (the documents are static per process). The granted action ids and the
// layout variants a set of roles holds are ./manifest's.
// ═══════════════════════════════════════════════════════════════

export const resolveRoles = (app: NiscApp, principal: string | null): readonly string[] => assignedRoles(app.assignments, principal);

export const memoKeyOf = (app: NiscApp, principal: string | null): string => memoKey(resolveRoles(app, principal), undefined);

// The compiled ScopePolicy this principal reads and writes under: their
// resolved `data` grants × the app's row behaviors. An ungranted phase is
// absent, and vex's default-deny refuses it.
export const resolvePolicy = (app: NiscApp, grants: readonly string[], principal: string | null): ScopePolicy => {
  // ONE POLICY PER ROLE, then merged — because a principal may hold several,
  // and reach belongs to the role rather than to the person.
  //
  // Compiling once for the principal assumed one role each. That holds until
  // somebody is two things at once: an instructor who also trains is staff on
  // the roster and a member in the class, and no single reach describes both —
  // studio-wide on the read they do as staff, their own rows on the write they
  // do as a member. Per role, each with its own scoping, and the union is what
  // they may do.
  return resolvePolicyForRoles(app, grants, resolveRoles(app, principal));
};

// THE SAME COMPILATION, given the roles directly — for a caller that has already
// resolved who somebody is and should not have to ask a second time. The
// principal was only ever a way to reach `roles`; taking it as the argument is
// what lets identity resolve once per session instead of once per request.
export const resolvePolicyForRoles = (app: NiscApp, grants: readonly string[], roles: readonly string[]): ScopePolicy => {
  const behaviors = app.behaviors ?? {};
  return mergeScopePolicies(
    roles.map((role) =>
      createScopePolicy(resolvePrincipal(app.charter, grants, [role], 'data'), behaviors, resolveScoping(app.charter, role)),
    ),
  );
};

// THE SAME PRINCIPAL, COMPILED AT A REACH THE READ DEMANDS.
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
export const resolvePolicyAtReach = (
  app: NiscApp,
  grants: readonly string[],
  principal: string | null,
  reach: string,
): ScopePolicy => resolvePolicyAtReachForRoles(app, grants, resolveRoles(app, principal), reach);

export const resolvePolicyAtReachForRoles = (
  app: NiscApp,
  grants: readonly string[],
  roles: readonly string[],
  reach: string,
): ScopePolicy => createScopePolicy(resolvePrincipal(app.charter, grants, roles, 'data'), app.behaviors ?? {}, reach);
