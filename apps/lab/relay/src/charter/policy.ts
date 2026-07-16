import type { ScopePolicy, ScopeMatch, ScopeRule } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════
// The vex compiler — charter → a vex ScopePolicy, per principal.
//
// This is the ONE place in the system where charter and vex vocabulary
// coexist, and it lives on charter's side: charter imports vex's ScopePolicy
// TYPE to emit it. The arrow points one way — charter knows vex, vex never
// knows charter. Delete this file and charter still governs actions; vex
// still runs on a hand-authored policy.
//
// The compile is trivial because vex's policy already IS two things fused:
// which PHASES an entity has (read/write present or absent — that is ACL,
// and charter now owns it) and what a phase DOES (its match/set rules — row
// behavior, which charter never touches). So:
//
//   charter data grants  →  which phases exist   (selection, per principal)
//   behaviors table      →  what a phase does     (rules, static, app-owned)
//
// A granted phase carries its behaviors (or `[]` if none); an ungranted phase
// is absent, and vex's own `default: 'deny'` refuses it. The viewer's
// mark-won dies because their policy has no `deals` write phase — not a gate
// we added, but one charter never emitted.
// ═══════════════════════════════════════════════════════════

// The static, app-owned row behaviors: per table, what a GRANTED phase does.
// NOT access control — listing a table here grants nothing; charter decides
// whether a phase exists. `write` behaviors apply to every granted write
// phase (vex's own umbrella semantics, applied at compile time); the
// specific keys stack on top for their op. Deliberately the rules-only
// subset of vex's ScopeEntityRule: its `public`/`deny` variants are access
// control, which behaviors must never carry.
export type ScopeBehaviors = Record<
  string,
  { read?: ScopeMatch[]; write?: ScopeRule[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }
>;

// A data grant is `<table>.<verb leaf>` — `deals.read`, `deals.write.insert`.
// Each granted leaf becomes a SPECIFIC phase in the compiled policy (the
// compiler never emits vex's `write` umbrella — the charter already resolved
// the umbrella as a glob, so the output is exact). A granted phase carries
// the table's umbrella behaviors plus its op-specific ones; delete keeps
// matches only (nothing to set).
const onlyMatches = (rules: ScopeRule[]): ScopeMatch[] => rules.filter((r): r is ScopeMatch => 'match' in r);

export const policyFor = (dataGrants: ReadonlySet<string>, behaviors: ScopeBehaviors): ScopePolicy => {
  const entities: Record<string, { read?: ScopeMatch[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }> = {};
  for (const grant of dataGrants) {
    const dot = grant.indexOf('.'); // table names carry no dots; the rest is the verb path
    if (dot < 0) continue;
    const table = grant.slice(0, dot);
    const verb = grant.slice(dot + 1);
    const b = behaviors[table];
    const rule = (entities[table] ??= {});
    if (verb === 'read') rule.read = b?.read ?? [];
    else if (verb === 'write.insert') rule.insert = [...(b?.write ?? []), ...(b?.insert ?? [])];
    else if (verb === 'write.update') rule.update = [...(b?.write ?? []), ...(b?.update ?? [])];
    else if (verb === 'write.delete') rule.delete = [...onlyMatches(b?.write ?? []), ...(b?.delete ?? [])];
  }
  return { default: 'deny', entities };
};
