import { resolvePrincipal } from '@niscorp/charter';
import type { LayoutNode } from '@niscorp/nova';
import { assignedRoles, memoKey } from '../identity';
import type { NiscApp } from './app';

// ═══════════════════════════════════════════════════════════════
// WHAT A SET OF ROLES HOLDS — the charter applied to the manifest: the
// action ids a set of roles is granted (with the resolved set's version
// token) and the layout variant it holds of each. Pure, every one; who
// somebody is belongs to ../identity, and what they may read and write to
// the policy functions (../principal.ts).
// ═══════════════════════════════════════════════════════════════

// The role combinations this application can produce — declared if the app says
// so, derived from the assignment map if it does not. Deduplicated, because the
// derived form yields one entry per PERSON and every consumer wants one entry
// per COMBINATION: at Lyra's scale that is 600k entries collapsing to about a
// dozen, and it is the same dozen either way.
export const wearableOf = (app: Pick<NiscApp, 'wearable' | 'assignments'>): readonly (readonly string[])[] => {
  const declared = app.wearable;
  const source = declared ?? Object.values(app.assignments ?? {});
  const seen = new Map<string, readonly string[]>();
  for (const roles of source) {
    const key = [...roles].sort().join('\0');
    if (!seen.has(key)) seen.set(key, roles);
  }
  return [...seen.values()];
};

export type Catalog = { ids: readonly string[]; hash: string };

// Of a list of granted action ids, the ones that are there for an install
// list: an action an integration ships exists only where that integration is
// installed. `undefined` is "every one is live". Handed in, because what an
// integration is, and which action belongs to which, is not known here
// (../integrations.ts, filterInstalled).
export type InstalledOnly = (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[];

// The application, resolved for a set of roles — granted action ids plus
// the version token (equal hash, equal application; pushed over the
// socket as the catalog-change signal).
// GIVEN ROLES rather than a principal — for callers that have already resolved
// who somebody is. The principal was only ever a way to reach `roles` (and,
// for the catalog, the tenant's install list).
export const catalogFor = (
  app: Pick<NiscApp, 'charter' | 'actions'>,
  roles: readonly string[],
  installed: readonly string[] | undefined,
  installedOnly: InstalledOnly,
): Catalog => {
  const granted = [...resolvePrincipal(app.charter, Object.keys(app.actions), roles, 'actions')].sort();
  const ids = [...installedOnly(granted, installed === undefined ? undefined : new Set(installed))];
  return { ids, hash: versionToken(ids) };
};

export const resolveVariantsForRoles = (app: Pick<NiscApp, 'charter' | 'layouts'>, roles: readonly string[]): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  const granted = resolvePrincipal(app.charter, Object.keys(variants), roles, 'layouts');
  const bindings = new Map<string, LayoutNode>();
  for (const id of granted) {
    const variant = variants[id];
    if (variant !== undefined) bindings.set(variant.action, variant.layout);
  }
  return bindings;
};

// The principal's layout bindings — action id → the granted variant's
// layout (ring 2). Grants come from the charter's `layouts` section over
// the variant-id universe. Two granted variants of one action is
// incoherence the boot check refused (./verify.ts), so resolution never picks.
export const resolveVariants = (app: NiscApp, principal: string | null): ReadonlyMap<string, LayoutNode> =>
  resolveVariantsForRoles(app, assignedRoles(app.assignments, principal));

// WHAT EACH SET OF ROLES HOLDS, REMEMBERED.
//
// Both answers are a function of the manifest and of (roles + install list),
// and of nothing about the person asking. So they are kept by that key — one
// entry per combination, about ten in a real deployment, where a key per
// principal was one per person — until the manifest changes. Whoever changes
// the manifest drops them (./running.ts); nobody else has to remember to.
export type RoleHoldings = {
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  drop: () => void;
};

export const createRoleHoldings = (config: {
  // The charter, the actions and the layout variants as they are now: read at
  // each miss, never held, because they are what changes.
  manifest: () => Pick<NiscApp, 'charter' | 'actions' | 'layouts'>;
  installedOnly: InstalledOnly;
}): RoleHoldings => {
  const catalogs = new Map<string, Catalog>();
  const variants = new Map<string, ReadonlyMap<string, LayoutNode>>();
  const kept = <Held>(memo: Map<string, Held>, key: string, resolve: () => Held): Held => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const resolved = resolve();
    memo.set(key, resolved);
    return resolved;
  };
  return {
    catalogFor: (roles, installed) => kept(catalogs, memoKey(roles, installed), () => catalogFor(config.manifest(), roles, installed, config.installedOnly)),
    // Which variant is held does not depend on what is installed.
    variantsFor: (roles) => kept(variants, memoKey(roles, undefined), () => resolveVariantsForRoles(config.manifest(), roles)),
    drop: () => {
      catalogs.clear();
      variants.clear();
    },
  };
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
