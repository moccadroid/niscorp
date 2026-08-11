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
export type ScopeRules = { read?: ScopeMatch[]; write?: ScopeRule[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] };

// A table carries EITHER one rule set — the shape above, unchanged — or several
// NAMED ones, of which `default` is what an unprofiled principal gets.
//
// WHY: scoping used to be a property of the TABLE, so every rung holding any
// grant on it got the same reach. "The desk reads every booking; a member reads
// their own" was therefore unsayable, and the only way to say it was a SECOND
// TABLE carrying the tighter rule — one fact in two places, kept level by a
// trigger, drifting the first time the trigger was wrong.
//
// Reach is a property of the RUNG, not of the grant and not of the table: a
// member acts for themselves whatever they are reading. So the profile is
// chosen once, per principal, and applies to every table they touch — falling
// back to a table's `default` where it declares no variant, which is what makes
// the common case (a shared timetable, read the ordinary way) need no entry.
//
// The two shapes are told apart by their keys: a rule set has at least one of
// read/write/insert/update/delete, a named map has none of them.
export type NamedScopeBehaviors = Record<string, ScopeRules>;

export type ScopeBehaviors = Record<string, ScopeRules | NamedScopeBehaviors>;

const RULE_KEYS = ['read', 'write', 'insert', 'update', 'delete'] as const;

const isRuleSet = (value: ScopeRules | NamedScopeBehaviors): value is ScopeRules =>
  RULE_KEYS.some((k) => k in value);

// THE LOOKUP.
//
// A table with no entry at all is rule-free, as before — listing a table in
// behaviors was never what granted it.
//
// A table declaring NAMED variants and no `default` refuses an unprofiled
// principal rather than falling through to no rules. That is the fail-closed
// half: a table whose author went to the trouble of naming its reaches is one
// where "no rule" is not a safe guess.
const behaviorFor = (behaviors: ScopeBehaviors, table: string, profile: string | undefined): ScopeRules | undefined => {
  const entry = behaviors[table];
  if (entry === undefined) return {};
  if (isRuleSet(entry)) return entry;
  // Named map: the profile if the table declares it, otherwise the default.
  return (profile === undefined ? undefined : entry[profile]) ?? entry['default'];
};

const onlyMatches = (rules: ScopeRule[]): ScopeMatch[] => rules.filter((r): r is ScopeMatch => 'match' in r);

// Grants + behaviors → a ScopePolicy. Each granted leaf becomes a
// SPECIFIC phase (the builder never emits the `write` umbrella — the
// caller already resolved it, so the output is exact); a granted phase
// carries the table's umbrella behaviors plus its op's own, and delete
// keeps matches only (nothing to set). Ungranted phases are absent, and
// `default: 'deny'` refuses them — deny by absence.
const VERBS: ReadonlySet<string> = new Set(SCOPE_VERBS);

/** Every profile name any table declares. A profile nobody declares is a typo. */
export const scopeProfiles = (behaviors: ScopeBehaviors): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const entry of Object.values(behaviors)) {
    if (isRuleSet(entry)) continue;
    for (const name of Object.keys(entry)) if (name !== 'default') names.add(name);
  }
  return names;
};

// `scoping` names the principal's profile — the rung's answer to "how far does
// this person reach", chosen once and applied to every table they touch. An
// UNKNOWN profile is refused wholesale: it cannot silently mean "the default",
// because a mistyped profile would then widen a member to every row in every
// table they hold a grant on. That is the one failure mode a policy layer may
// not have, so it is a hard refusal rather than a fallback.
export const createScopePolicy = (
  grants: ReadonlySet<string>,
  behaviors: ScopeBehaviors = {},
  scoping?: string,
): ScopePolicy => {
  if (scoping !== undefined && !scopeProfiles(behaviors).has(scoping)) return { default: 'deny', entities: {} };
  const entities: Record<string, { read?: ScopeMatch[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }> = {};
  for (const grant of grants) {
    const dot = grant.indexOf('.'); // table names carry no dots; the rest is the verb
    if (dot < 0) continue;
    const table = grant.slice(0, dot);
    const verb = grant.slice(dot + 1);
    if (!VERBS.has(verb)) continue; // a malformed verb grants nothing, not even an entity entry
    const b = behaviorFor(behaviors, table, scoping);
    if (b === undefined) continue; // the profile names nothing for this table — grant nothing
    const rule = (entities[table] ??= {});
    if (verb === 'read') rule.read = b?.read ?? [];
    else if (verb === 'write.insert') rule.insert = [...(b?.write ?? []), ...(b?.insert ?? [])];
    else if (verb === 'write.update') rule.update = [...(b?.write ?? []), ...(b?.update ?? [])];
    else if (verb === 'write.delete') rule.delete = [...onlyMatches(b?.write ?? []), ...(b?.delete ?? [])];
  }
  return { default: 'deny', entities };
};

// ═══════════════════════════════════════════════════════════════
// A PRINCIPAL MAY HOLD SEVERAL ROLES, and reach belongs to the role.
//
// One policy per principal assumes one role per principal. That assumption
// survives right up until somebody is two things at once — an instructor who
// also trains is staff on the roster and a member in the class — and then a
// single profile cannot describe them: studio-wide on the read they do as
// staff, their own rows on the write they do as a member.
//
// So a policy is compiled PER ROLE, each with that role's own reach, and the
// results are merged here. A principal may do anything any of their roles
// permits, which is what makes holding two roles additive rather than a
// conflict to be refused.
//
// MERGE RULE: per entity and phase, the BROADEST rule set wins — fewest match
// rules, since every match narrows. Profiles are refinements of a default
// (personal = the tenant rule plus one more), so "fewest" is "widest" in
// practice, and a phase only one role grants keeps that role's rules intact
// (which is what carries a member's identity stamp onto a write no other role
// grants).
// ═══════════════════════════════════════════════════════════════

const matchCount = (rules: readonly (ScopeMatch | ScopeRule)[] | undefined): number =>
  (rules ?? []).filter((r) => 'match' in r).length;

/** The union of several compiled policies: anything any of them permits. */
export const mergeScopePolicies = (policies: readonly ScopePolicy[]): ScopePolicy => {
  const entities: Record<string, { read?: ScopeMatch[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] }> = {};
  for (const policy of policies) {
    for (const [table, rule] of Object.entries(policy.entities)) {
      if (rule === undefined || 'public' in rule || 'deny' in rule) continue;
      const into = (entities[table] ??= {});
      for (const phase of ['read', 'insert', 'update', 'delete'] as const) {
        const incoming = rule[phase];
        if (incoming === undefined) continue;
        const held = into[phase];
        // Absent means the phase is refused, so the first grant always wins the
        // slot; after that, fewer matches means wider access.
        if (held === undefined || matchCount(incoming) < matchCount(held)) {
          (into as Record<string, unknown>)[phase] = incoming;
        }
      }
    }
  }
  return { default: 'deny', entities };
};
