import type { Charter, RoleDef } from './types';
import { matchAll } from './glob';

// Resolution is a pure function from (charter, action ids) to a concrete id
// set per role — CHARTER.md's algebra, verbatim:
//
//   resolved(role) = (∪ resolved(extends) ∪ match(allow))
//                    − match(deny)
//                    − ∪ resolved(without)
//
// Order-independent (all subtraction is set-minus); deny wins within a role
// (no re-allow after a deny in the same role); denies do NOT inherit
// (`extends` unions resolved SETS — a child may re-add what a parent denied,
// and the verifier flags it); cycles and unknown references are errors.

export class CharterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharterError';
  }
}

export const normalizeRole = (def: RoleDef): { allow: string[]; extends: string[]; deny: string[]; without: string[] } =>
  Array.isArray(def)
    ? { allow: def, extends: [], deny: [], without: [] }
    : { allow: def.allow ?? [], extends: def.extends ?? [], deny: def.deny ?? [], without: def.without ?? [] };

export const resolveRole = (
  charter: Charter,
  ids: readonly string[],
  role: string,
  memo: Map<string, ReadonlySet<string>> = new Map(),
  visiting: Set<string> = new Set(),
): ReadonlySet<string> => {
  const cached = memo.get(role);
  if (cached !== undefined) return cached;
  const def = charter[role];
  if (def === undefined) throw new CharterError(`Unknown role "${role}"`);
  if (visiting.has(role)) throw new CharterError(`Role cycle through "${role}"`);
  visiting.add(role);

  const { allow, extends: parents, deny, without } = normalizeRole(def);
  const resolved = new Set<string>();
  for (const parent of parents) for (const id of resolveRole(charter, ids, parent, memo, visiting)) resolved.add(id);
  for (const id of matchAll(allow, ids)) resolved.add(id);
  for (const id of matchAll(deny, ids)) resolved.delete(id);
  for (const sub of without) for (const id of resolveRole(charter, ids, sub, memo, visiting)) resolved.delete(id);

  visiting.delete(role);
  memo.set(role, resolved);
  return resolved;
};

// A principal wears roles; its catalog is the union of their resolved sets.
export const resolvePrincipal = (charter: Charter, ids: readonly string[], roles: readonly string[]): Set<string> => {
  const memo = new Map<string, ReadonlySet<string>>();
  const out = new Set<string>();
  for (const role of roles) for (const id of resolveRole(charter, ids, role, memo)) out.add(id);
  return out;
};
