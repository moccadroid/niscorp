import type { Charter, RoleDef, Section, Selection } from './types';
import { matchAll } from './glob';

export class CharterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharterError';
  }
}

const asSelection = (s: Selection | undefined): { allow: string[]; deny: string[] } =>
  s === undefined ? { allow: [], deny: [] } : Array.isArray(s) ? { allow: s, deny: [] } : { allow: s.allow ?? [], deny: s.deny ?? [] };

export const normalizeRole = (
  def: RoleDef,
  section: Section,
): { allow: string[]; deny: string[]; extends: string[]; without: string[] } => {
  if (Array.isArray(def)) {
    return section === 'actions'
      ? { allow: def, deny: [], extends: [], without: [] }
      : { allow: [], deny: [], extends: [], without: [] };
  }
  const composition = { extends: def.extends ?? [], without: def.without ?? [] };
  const sel =
    section === 'actions' && def.actions === undefined
      ? { allow: def.allow ?? [], deny: def.deny ?? [] }
      : asSelection(def[section]);
  return { ...sel, ...composition };
};

export const resolveRole = (
  charter: Charter,
  universe: readonly string[],
  role: string,
  section: Section,
  memo: Map<string, ReadonlySet<string>> = new Map(),
  visiting: Set<string> = new Set(),
): ReadonlySet<string> => {
  const cached = memo.get(role);
  if (cached !== undefined) return cached;
  const def = charter[role];
  if (def === undefined) throw new CharterError(`Unknown role "${role}"`);
  if (visiting.has(role)) throw new CharterError(`Role cycle through "${role}"`);
  visiting.add(role);

  const { allow, extends: parents, deny, without } = normalizeRole(def, section);
  const resolved = new Set<string>();
  for (const parent of parents) for (const id of resolveRole(charter, universe, parent, section, memo, visiting)) resolved.add(id);
  for (const id of matchAll(allow, universe)) resolved.add(id);
  for (const id of matchAll(deny, universe)) resolved.delete(id);
  for (const sub of without) for (const id of resolveRole(charter, universe, sub, section, memo, visiting)) resolved.delete(id);

  visiting.delete(role);
  memo.set(role, resolved);
  return resolved;
};

// One role, not a list: two roles naming different profiles are not a conflict
// to refuse. A caller holding several resolves each and merges the results.
export const resolveScoping = (charter: Charter, role: string): string | undefined => {
  const def = charter[role];
  return def === undefined || Array.isArray(def) ? undefined : def.scoping;
};

export const resolvePrincipal = (
  charter: Charter,
  universe: readonly string[],
  roles: readonly string[],
  section: Section = 'actions',
): Set<string> => {
  const memo = new Map<string, ReadonlySet<string>>();
  const out = new Set<string>();
  for (const role of roles) for (const id of resolveRole(charter, universe, role, section, memo)) out.add(id);
  return out;
};
