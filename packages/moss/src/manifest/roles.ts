import { resolvePrincipal } from '@niscorp/charter';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { assignedRoles, memoKey } from '../identity';
import type { LayoutVariant, NiscApp } from './app';

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

export type InstalledOnly = (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[];

// A filter may only narrow: an id it answers that it was not handed is dropped,
// so a filter cannot grant an action.
export const narrowedBy = (filter: InstalledOnly, ids: readonly string[], installed: ReadonlySet<string> | undefined): readonly string[] => {
  const answered = new Set(filter(ids, installed));
  return ids.filter((id) => answered.has(id));
};

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

export const variantLayouts = (variants: Readonly<Record<string, LayoutVariant>>, held: Iterable<string>): ReadonlyMap<string, LayoutNode> => {
  const layouts = new Map<string, LayoutNode>();
  for (const id of held) {
    const variant = variants[id];
    if (variant !== undefined) layouts.set(variant.action, variant.layout);
  }
  return layouts;
};

export const resolveVariantsForRoles = (app: Pick<NiscApp, 'charter' | 'layouts'>, roles: readonly string[]): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  return variantLayouts(variants, resolvePrincipal(app.charter, Object.keys(variants), roles, 'layouts'));
};

export const withVariants = (
  actions: Readonly<Record<string, ActionDefinition>>,
  ids: readonly string[],
  layouts: ReadonlyMap<string, LayoutNode>,
): [string, ActionDefinition][] =>
  ids.flatMap((id): [string, ActionDefinition][] => {
    const definition = actions[id];
    if (definition === undefined) return [];
    const layout = layouts.get(id);
    return [[id, layout === undefined ? definition : { ...definition, layout }]];
  });

export const definitionsFor = (
  actions: Readonly<Record<string, ActionDefinition>>,
  ids: readonly string[],
  variants: ReadonlyMap<string, LayoutNode>,
): Readonly<Record<string, ActionDefinition>> => Object.freeze(Object.fromEntries(withVariants(actions, ids, variants)));

export type RoleMemo = {
  catalogFor: (roles: readonly string[], installed: readonly string[] | undefined) => Catalog;
  variantsFor: (roles: readonly string[]) => ReadonlyMap<string, LayoutNode>;
  definitionsFor: (roles: readonly string[], installed: readonly string[] | undefined) => Readonly<Record<string, ActionDefinition>>;
  drop: () => void;
};

export const createRoleMemo = (config: {
  manifest: () => Pick<NiscApp, 'charter' | 'actions' | 'layouts'>;
  installedOnly: InstalledOnly;
}): RoleMemo => {
  const catalogs = new Map<string, Catalog>();
  const variants = new Map<string, ReadonlyMap<string, LayoutNode>>();
  const definitions = new Map<string, Readonly<Record<string, ActionDefinition>>>();
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
    definitionsFor: (roles, installed) =>
      kept(definitions, memoKey(roles, installed), () => definitionsFor(config.manifest().actions, roleMemo.catalogFor(roles, installed).ids, roleMemo.variantsFor(roles))),
    drop: () => {
      catalogs.clear();
      variants.clear();
      definitions.clear();
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
