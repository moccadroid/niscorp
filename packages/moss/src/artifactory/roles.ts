import { resolvePrincipal } from '@niscorp/charter';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { memoKey } from '../identity';
import { actionLayoutRef, variantLayouts, withVariants } from '../manifest';
import type { NiscApp } from '../manifest';

export type Catalog = { ids: readonly string[]; hash: string };

export type CatalogFilter = (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[];

// A filter may only narrow: an id it answers that it was not handed is dropped,
// so a filter cannot grant an action.
export const narrowedBy = (filter: CatalogFilter, ids: readonly string[], installed: ReadonlySet<string> | undefined): readonly string[] => {
  const answered = new Set(filter(ids, installed));
  return ids.filter((id) => answered.has(id));
};

export const catalogFor = (
  app: Pick<NiscApp, 'charter' | 'actions'>,
  roles: readonly string[],
  installed: readonly string[] | undefined,
  installedOnly: CatalogFilter,
): Catalog => {
  const granted = [...resolvePrincipal(app.charter, Object.keys(app.actions), roles, 'actions')].sort();
  const ids = [...installedOnly(granted, installed === undefined ? undefined : new Set(installed))];
  return { ids, hash: versionToken(ids) };
};

export const resolveVariantsForRoles = (app: Pick<NiscApp, 'charter' | 'layouts'>, roles: readonly string[]): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  return variantLayouts(variants, resolvePrincipal(app.charter, Object.keys(variants), roles, 'layouts'));
};

export const definitionsFor = (
  actions: Readonly<Record<string, ActionDefinition>>,
  ids: readonly string[],
  variants: ReadonlyMap<string, LayoutNode>,
): Readonly<Record<string, ActionDefinition>> => Object.freeze(Object.fromEntries(withVariants(actions, ids, variants)));

export type StoredLayouts = {
  actions: Readonly<Record<string, ActionDefinition>>;
  layouts: Readonly<Record<string, LayoutNode>>;
};

export const actionsWithStoredLayouts = (definitions: Readonly<Record<string, ActionDefinition>>): StoredLayouts => {
  const actions: Record<string, ActionDefinition> = {};
  const layouts: Record<string, LayoutNode> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    const layout = definition.layout;
    // A string is already the name of a layout the store holds.
    if (layout === undefined || typeof layout === 'string') {
      actions[id] = definition;
      continue;
    }
    const ref = actionLayoutRef(id);
    layouts[ref] = layout;
    actions[id] = { ...definition, layout: { ref } };
  }
  return { actions: Object.freeze(actions), layouts: Object.freeze(layouts) };
};

export type RoleMemo = {
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  storedLayoutsFor: (roles: readonly string[], installed: readonly string[] | undefined) => StoredLayouts;
  drop: () => void;
};

export const createRoleMemo = (config: {
  manifest: () => Pick<NiscApp, 'charter' | 'actions' | 'layouts'>;
  installedOnly: CatalogFilter;
}): RoleMemo => {
  const catalogs = new Map<string, Catalog>();
  const variants = new Map<string, ReadonlyMap<string, LayoutNode>>();
  const stored = new Map<string, StoredLayouts>();
  const kept = <Held>(memo: Map<string, Held>, key: string, resolve: () => Held): Held => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const resolved = resolve();
    memo.set(key, resolved);
    return resolved;
  };
  const roleMemo: RoleMemo = {
    catalogFor: (roles, installed) => kept(catalogs, memoKey(roles, installed), () => catalogFor(config.manifest(), roles, installed, config.installedOnly)),
    variantsFor: (roles) => kept(variants, memoKey(roles, undefined), () => resolveVariantsForRoles(config.manifest(), roles)),
    storedLayoutsFor: (roles, installed) =>
      kept(stored, memoKey(roles, installed), () =>
        actionsWithStoredLayouts(definitionsFor(config.manifest().actions, roleMemo.catalogFor(roles, installed).ids, roleMemo.variantsFor(roles))),
      ),
    drop: () => {
      catalogs.clear();
      variants.clear();
      stored.clear();
    },
  };
  return roleMemo;
};

const versionToken = (ids: readonly string[]): string => {
  const s = ids.join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
