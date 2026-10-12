import type { ScopePolicy, ScopeMatch, ScopeRule, ScopeValues } from './scope.types.js';
import { isSetMatch } from './scope.types.js';
import type { ScopeBinding } from '../types.js';

export const SCOPE_VERBS = ['read', 'write.insert', 'write.update', 'write.delete'] as const;

export const scopeGrants = (tables: readonly string[]): string[] =>
  tables.flatMap((t) => SCOPE_VERBS.map((v) => `${t}.${v}`));

// Rules only: listing a table here grants nothing, and the `public`/`deny`
// variants of ScopeEntityRule are access control, which behaviors never carry.
export type ScopeRules = { read?: ScopeMatch[]; write?: ScopeRule[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] };

export type NamedScopeBehaviors = Record<string, ScopeRules>;

export type ScopeBehaviors = Record<string, ScopeRules | NamedScopeBehaviors>;

const RULE_KEYS = ['read', 'write', 'insert', 'update', 'delete'] as const;

const isRuleSet = (value: ScopeRules | NamedScopeBehaviors): value is ScopeRules =>
  RULE_KEYS.some((k) => k in value);

// A table with no entry has no rules. One with named variants and no `default`
// gives an unprofiled principal `undefined`, which grants nothing: there, "no
// rule" is not a safe guess.
const behaviorFor = (behaviors: ScopeBehaviors, table: string, profile: string | undefined): ScopeRules | undefined => {
  const entry = behaviors[table];
  if (entry === undefined) return {};
  if (isRuleSet(entry)) return entry;
  return (profile === undefined ? undefined : entry[profile]) ?? entry['default'];
};

const onlyMatches = (rules: ScopeRule[]): ScopeMatch[] => rules.filter((r): r is ScopeMatch => 'match' in r);

const VERBS: ReadonlySet<string> = new Set(SCOPE_VERBS);

// Every reach and every phase counts: which column is the caller's does not
// depend on what this caller may do to it.
const bindingsOf = (entry: ScopeRules | NamedScopeBehaviors): { field: string; key: string }[] =>
  (isRuleSet(entry) ? [entry] : Object.values(entry)).flatMap((rules) =>
    RULE_KEYS.flatMap((phase) =>
      (rules[phase] ?? []).map((rule: ScopeRule) =>
        'set' in rule ? { field: rule.set, key: rule.to } : isSetMatch(rule) ? { field: rule.match, key: rule.in } : { field: rule.match, key: rule.to },
      ),
    ),
  );

export const scopeBindings = (behaviors: ScopeBehaviors, tables: readonly string[], scope: ScopeValues): ScopeBinding[] => {
  const seen = new Map<string, ScopeBinding>();
  for (const table of tables) {
    const entry = behaviors[table];
    if (entry === undefined) continue;
    for (const { field, key } of bindingsOf(entry)) {
      if (scope[key] === undefined || scope[key] === null) continue;
      seen.set(`${table}.${field}:${key}`, { entity: table, field, key });
    }
  }
  return [...seen.values()].sort((a, b) => `${a.entity}.${a.field}:${a.key}`.localeCompare(`${b.entity}.${b.field}:${b.key}`));
};

export const behaviorColumns = (behaviors: ScopeBehaviors): { entity: string; field: string }[] =>
  Object.entries(behaviors).flatMap(([table, entry]) => bindingsOf(entry).map(({ field }) => ({ entity: table, field })));

export const scopeProfiles = (behaviors: ScopeBehaviors): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const entry of Object.values(behaviors)) {
    if (isRuleSet(entry)) continue;
    for (const name of Object.keys(entry)) if (name !== 'default') names.add(name);
  }
  return names;
};

// An unknown profile is refused whole rather than read as the default: a
// mistyped profile would otherwise widen a member to every row of every table
// they hold a grant on.
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
    if (!VERBS.has(verb)) continue;
    const b = behaviorFor(behaviors, table, scoping);
    if (b === undefined) continue;
    const rule = (entities[table] ??= {});
    if (verb === 'read') rule.read = b?.read ?? [];
    else if (verb === 'write.insert') rule.insert = [...(b?.write ?? []), ...(b?.insert ?? [])];
    else if (verb === 'write.update') rule.update = [...(b?.write ?? []), ...(b?.update ?? [])];
    else if (verb === 'write.delete') rule.delete = [...onlyMatches(b?.write ?? []), ...(b?.delete ?? [])];
  }
  return { default: 'deny', entities };
};

// A principal may do what any of their roles permits. Per entity and phase the
// rule set with the fewest matches wins: every match narrows, and a profile
// refines the default by adding matches, so fewest is widest.
const matchCount = (rules: readonly (ScopeMatch | ScopeRule)[] | undefined): number =>
  (rules ?? []).filter((r) => 'match' in r).length;

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
        if (held === undefined || matchCount(incoming) < matchCount(held)) {
          (into as Record<string, unknown>)[phase] = incoming;
        }
      }
    }
  }
  return { default: 'deny', entities };
};
