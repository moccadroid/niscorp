import type { ScopePolicy, ScopeMatch, ScopeRule } from './scope.types.js';

// ═══════════════════════════════════════════════════════════════
// Grants — a ScopePolicy described as strings.
//
// A grant is `<table>.<verb>` where the verb is one of SCOPE_VERBS —
// vex's own phase grammar as leaves: `read`, plus the three write ops
// under the `write` namespace. `write` itself is never a grant; a caller
// that means "every write" grants all three (an ACL layer above does
// that with a glob — `deals.write.*`).
//
// The dialect exists so a policy layer (a charter, a role system, a
// config file) can hand vex a flat string set and get vex's native
// contract back — with no imports in either direction: the strings are
// opaque to the layer that resolves them and native to vex, which is
// where their meaning lives.
// ═══════════════════════════════════════════════════════════════

export const SCOPE_VERBS = ['read', 'write.insert', 'write.update', 'write.delete'] as const;

// Every grant a set of tables can carry — tables × SCOPE_VERBS. The full
// set a policy layer resolves selections against; derived, never authored
// (a server derives `tables` from the introspected schema).
export const scopeGrants = (tables: readonly string[]): string[] =>
  tables.flatMap((t) => SCOPE_VERBS.map((v) => `${t}.${v}`));

// The static, app-owned row behaviors: per table, what a GRANTED phase
// does. NOT access control — listing a table here grants nothing; the
// grant set decides whether a phase exists. `write` behaviors apply to
// every granted write phase (the umbrella, applied at build time); the
// specific keys stack on top for their op. Deliberately the rules-only
// subset of ScopeEntityRule: its `public`/`deny` variants are access
// control, which behaviors must never carry.
export type ScopeBehaviors = Record<
  string,
  { read?: ScopeMatch[]; write?: ScopeRule[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }
>;

const onlyMatches = (rules: ScopeRule[]): ScopeMatch[] => rules.filter((r): r is ScopeMatch => 'match' in r);

// Grants + behaviors → a ScopePolicy. Each granted leaf becomes a
// SPECIFIC phase (the builder never emits the `write` umbrella — the
// caller already resolved it, so the output is exact); a granted phase
// carries the table's umbrella behaviors plus its op's own, and delete
// keeps matches only (nothing to set). Ungranted phases are absent, and
// `default: 'deny'` refuses them — deny by absence.
const VERBS: ReadonlySet<string> = new Set(SCOPE_VERBS);

export const createScopePolicy = (grants: ReadonlySet<string>, behaviors: ScopeBehaviors = {}): ScopePolicy => {
  const entities: Record<string, { read?: ScopeMatch[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }> = {};
  for (const grant of grants) {
    const dot = grant.indexOf('.'); // table names carry no dots; the rest is the verb
    if (dot < 0) continue;
    const table = grant.slice(0, dot);
    const verb = grant.slice(dot + 1);
    if (!VERBS.has(verb)) continue; // a malformed verb grants nothing, not even an entity entry
    const b = behaviors[table];
    const rule = (entities[table] ??= {});
    if (verb === 'read') rule.read = b?.read ?? [];
    else if (verb === 'write.insert') rule.insert = [...(b?.write ?? []), ...(b?.insert ?? [])];
    else if (verb === 'write.update') rule.update = [...(b?.write ?? []), ...(b?.update ?? [])];
    else if (verb === 'write.delete') rule.delete = [...onlyMatches(b?.write ?? []), ...(b?.delete ?? [])];
  }
  return { default: 'deny', entities };
};
