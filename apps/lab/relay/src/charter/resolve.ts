import type { Charter, RoleDef, Section, Selection } from './types';
import { matchAll } from './glob';

// Resolution is a pure function from (charter, universe, section) to a
// concrete id set per role — CHARTER.md's algebra, verbatim, per section:
//
//   resolved(role) = (∪ resolved(extends) ∪ match(allow))
//                    − match(deny)
//                    − ∪ resolved(without)
//
// The engine is UNIVERSE-BLIND: it resolves globs over opaque strings and
// never learns what a string means. `actions` and `data` run the SAME code
// against different universes. Order-independent (all subtraction is
// set-minus); deny wins within a role; denies do NOT inherit (a child may
// re-add what a parent denied — the verifier flags it); cycles and unknown
// references are errors.

export class CharterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharterError';
  }
}

// The verb leaves a `data` grant can carry — mirroring vex's phases: `read`,
// and the three specific write ops under the `write` NAMESPACE. `write` is
// never an atom (leaves-only, like everywhere else); the umbrella is a glob —
// `deals.write.*` grants all three, `*.write.delete` denies deletes anywhere.
// "The id hierarchy is the taxonomy", applied to verbs.
export const DATA_VERBS = ['read', 'write.insert', 'write.update', 'write.delete'] as const;

// The data universe = every table × every verb leaf, derived from the
// schema's table list — nobody authors these strings.
export const dataUniverse = (tables: readonly string[]): string[] =>
  tables.flatMap((t) => DATA_VERBS.map((v) => `${t}.${v}`));

const asSelection = (s: Selection | undefined): { allow: string[]; deny: string[] } =>
  s === undefined ? { allow: [], deny: [] } : Array.isArray(s) ? { allow: s, deny: [] } : { allow: s.allow ?? [], deny: s.deny ?? [] };

// A role's atoms for ONE section, plus its role-level composition (shared
// across sections). A bare array is an actions-only role; top-level
// `allow`/`deny` are sugar for the `actions` section.
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
  // Actions: explicit `actions:` wins, else the top-level allow/deny sugar.
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

// A principal wears roles; a section's grant is the union of their resolved
// sets in that section's universe.
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
