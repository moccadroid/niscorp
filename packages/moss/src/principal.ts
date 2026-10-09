import { createScopePolicy, mergeScopePolicies } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal, resolveScoping } from '@niscorp/charter';
import type { LayoutNode } from '@niscorp/nova';
import { filterInstalled } from './integrations';
import { assignedRoles, memoKey } from './identity';
import type { NiscApp } from './app';

// ═══════════════════════════════════════════════════════════════
// Per-principal resolution — what the catalog service does at login:
// roles from the assignment rows, the granted action ids (with the
// resolved-set version token), and the compiled vex ScopePolicy. All
// pure; the server memoizes (the documents are static per process).
// ═══════════════════════════════════════════════════════════════

export const resolveRoles = (app: NiscApp, principal: string | null): readonly string[] => assignedRoles(app.assignments, principal);

// The role combinations this application can produce — declared if the app says
// so, derived from the assignment map if it does not. Deduplicated, because the
// derived form yields one entry per PERSON and every consumer wants one entry
// per COMBINATION: at Lyra's scale that is 600k entries collapsing to about a
// dozen, and it is the same dozen either way.
export const wearableOf = (app: NiscApp): readonly (readonly string[])[] => {
  const declared = app.wearable;
  const source = declared ?? Object.values(app.assignments ?? {});
  const seen = new Map<string, readonly string[]>();
  for (const roles of source) {
    const key = [...roles].sort().join('\0');
    if (!seen.has(key)) seen.set(key, roles);
  }
  return [...seen.values()];
};

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

export type Catalog = { ids: readonly string[]; hash: string };

// The application, resolved for one principal — granted action ids plus
// the version token (equal hash, equal application; pushed over the
// socket as the catalog-change signal).
// THE SAME RESOLUTIONS, given roles rather than a principal — for callers that
// have already resolved who somebody is. The principal was only ever a way to
// reach `roles` (and, for the catalog, the tenant's install list).
export const resolveCatalogForRoles = (app: NiscApp, roles: readonly string[], installed: readonly string[] | undefined): Catalog => {
  const granted = [...resolvePrincipal(app.charter, Object.keys(app.actions), roles, 'actions')].sort();
  const ids = [...filterInstalled(granted, installed === undefined ? undefined : new Set(installed))];
  return { ids, hash: versionToken(ids) };
};

export const resolveVariantsForRoles = (app: NiscApp, roles: readonly string[]): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  const granted = resolvePrincipal(app.charter, Object.keys(variants), roles, 'layouts');
  const bindings = new Map<string, LayoutNode>();
  for (const id of granted) {
    const variant = variants[id];
    if (variant !== undefined) bindings.set(variant.action, variant.layout);
  }
  return bindings;
};

export const resolveCatalog = (app: NiscApp, principal: string | null): Catalog =>
  resolveCatalogForRoles(app, resolveRoles(app, principal), undefined);

// The principal's layout bindings — action id → the granted variant's
// layout (ring 2). Grants come from the charter's `layouts` section over
// the variant-id universe. Two granted variants of one action is
// incoherence `verifyVariants` refused at boot, so resolution never picks.
export const resolveVariants = (app: NiscApp, principal: string | null): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  const granted = resolvePrincipal(app.charter, Object.keys(variants), resolveRoles(app, principal), 'layouts');
  const bindings = new Map<string, LayoutNode>();
  for (const id of granted) {
    const variant = variants[id];
    if (variant !== undefined) bindings.set(variant.action, variant.layout);
  }
  return bindings;
};

// The boot-time coherence gate for ring 2 (server.ts throws on anything
// returned): every variant reshapes a shipped action, and no wearable
// combination the documents describe — each role alone, each assignment's
// union, the anonymous principal — resolves to two variants of one action.
export const verifyVariants = (app: NiscApp): string[] => {
  const variants = app.layouts ?? {};
  const ids = Object.keys(variants);
  if (ids.length === 0) return [];
  const errors: string[] = [];
  for (const [id, variant] of Object.entries(variants)) {
    if (app.actions[variant.action] === undefined) {
      errors.push(`layout variant "${id}" reshapes unknown action "${variant.action}"`);
    }
  }
  const wearers = new Map<string, readonly string[]>();
  for (const role of Object.keys(app.charter)) wearers.set(`role "${role}"`, [role]);
  // COMBINATIONS, not people. This gate asks "can anything wearable resolve to
  // two variants of one action" — a question about the set of combinations,
  // which walking the population answered only by accident. `wearable` declares
  // them; absent, they are derived from the assignment map exactly as before.
  for (const roles of wearableOf(app)) wearers.set(`the combination [${[...roles].join(', ')}]`, roles);
  wearers.set('the anonymous principal', ['public']);
  for (const [who, roles] of wearers) {
    let granted: ReadonlySet<string>;
    try {
      granted = resolvePrincipal(app.charter, ids, roles, 'layouts');
    } catch {
      continue; // an unknown or cyclic role is the charter verifier's finding, not this one
    }
    const byAction = new Map<string, string[]>();
    for (const id of granted) {
      const variant = variants[id];
      if (variant !== undefined) byAction.set(variant.action, [...(byAction.get(variant.action) ?? []), id]);
    }
    for (const [action, held] of byAction) {
      if (held.length > 1) {
        errors.push(`${who} holds ${held.length} variants of "${action}" (${held.sort().join(', ')}) — one variant per action per principal`);
      }
    }
  }
  return errors;
};

// A content hash of the resolved id set — identity, not cryptography
// (FNV-1a, hex).
const versionToken = (ids: readonly string[]): string => {
  const s = ids.join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
