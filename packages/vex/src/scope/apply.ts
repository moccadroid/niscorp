import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ResolvedQuery, ResolvedFilter, ResolvedSource, ResolvedJoin } from '../engine/engine.types.js';
import type { ScopePolicy, ScopeMatch } from './scope.types.js';
import { isSetMatch } from './scope.types.js';
import { VexError } from '../errors.js';
import { sqlName } from '../schemas/identifier.schema.js';

export class VexScopeError extends VexError {
  readonly entity: string;

  constructor(entity: string, message: string) {
    super('scope_denied', message);
    this.name = 'VexScopeError';
    this.entity = entity;
  }
}

// Row rules are placed after resolution, because only a resolved query knows
// its join kinds: a rule on a LEFT-joined table goes in that join's ON clause.
// In WHERE, `null = $tenant` is null and a driving row with a null key vanishes.

// A refusal says why: the table is not listed under `default: 'deny'`, it is
// denied, or it is listed with no read under `default: 'deny'`.
export type Refusal = 'unlisted' | 'denied' | 'ungranted';

export const readRulesOf = (policy: ScopePolicy, table: string): ScopeMatch[] | Refusal => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'deny' ? 'unlisted' : [];
  if ('public' in rule) return [];
  if ('deny' in rule) return 'denied';
  if (rule.read === undefined) return policy.default === 'deny' ? 'ungranted' : [];
  return rule.read;
};

const matchesFor = (policy: ScopePolicy, entity: string): ScopeMatch[] => {
  const rules = readRulesOf(policy, entity);
  if (rules === 'unlisted') throw new VexScopeError(entity, `Entity "${entity}" is not allowed by scope policy (default: deny)`);
  if (rules === 'denied') throw new VexScopeError(entity, `Entity "${entity}" is denied by scope policy`);
  if (rules === 'ungranted') throw new VexScopeError(entity, `Reads of "${entity}" are not allowed by scope policy (default: deny)`);
  return rules;
};

export const canReadTable = (policy: ScopePolicy, table: string): boolean => Array.isArray(readRulesOf(policy, table));

export const checkScope = (entities: Set<string>, policy: ScopePolicy): void => {
  for (const entity of entities) matchesFor(policy, entity);
};

const andMerge = (existing: ResolvedFilter | undefined, additions: ResolvedFilter[]): ResolvedFilter | undefined => {
  if (additions.length === 0) return existing;
  const all = existing === undefined ? additions : [existing, ...additions];
  if (all.length === 1) return all[0];

  const paths = new Map<string, { alias: string; column: string; schema: never }>();
  for (const part of all) for (const [key, value] of part.resolvedPaths) paths.set(key, value as never);
  return { original: { and: all.map((f) => f.original) }, resolvedPaths: paths as never };
};

// Keyed by the source's alias, not the entity's name: a table listed twice is
// two sources, and each gets its own rule.
const predicateFor = (
  entityName: string,
  alias: string,
  match: ScopeMatch,
  fields: { name: string; nullable: boolean }[],
): ResolvedFilter | undefined => {
  const field = fields.find((f) => f.name === match.match);
  // Fails closed: a rule naming a missing column must not let the read run without it.
  if (field === undefined) throw new VexScopeError(entityName, `Scope rule for "${entityName}" names column "${match.match}", which the table does not have`);
  const path = `${alias}.${match.match}`;
  // `in` against a scope value compiles to `col = ANY($n)`, so a null or empty
  // set matches no row.
  const original: Filter = isSetMatch(match)
    ? { in: [path, { $scope: match.in }] }
    : { eq: [path, { $scope: match.to }] };
  return { original, resolvedPaths: new Map([[path, { alias, column: match.match, schema: field as never }]]) as never };
};

type ScopeLevel = {
  sources: ResolvedSource[];
  joins: ResolvedJoin[];
  aliasMap: Map<string, string>;
  filter?: ResolvedFilter;
};

const placeInto = (level: ScopeLevel, policy: ScopePolicy): void => {
  const whereAdditions: ResolvedFilter[] = [];

  for (const source of level.sources) {
    const entity = source.entity;
    if (entity === undefined) continue;

    const join = level.joins.find((j) => j.toAlias === source.alias);
    for (const match of matchesFor(policy, entity.name)) {
      const predicate = predicateFor(entity.name, source.alias, match, entity.fields);
      if (predicate === undefined) continue;

      level.aliasMap.set(`${source.alias}.${match.match}`, `${source.alias}.${sqlName(match.match)}`);

      if (join !== undefined && join.kind === 'left') join.on = [...(join.on ?? []), predicate];
      else whereAdditions.push(predicate);
    }
  }

  const merged = andMerge(level.filter, whereAdditions);
  if (merged !== undefined) level.filter = merged;
};

// Rules go inside every `exists` as well: an uncorrelated `exists` over a
// scoped table would otherwise report whether any tenant has such a row.
export const scopeResolved = (resolved: ResolvedQuery, policy: ScopePolicy): ResolvedQuery => {
  for (const source of resolved.sources) {
    if (source.subquery !== undefined) scopeResolved(source.subquery, policy);
  }

  // The resolver collects nested `exists` nodes into this one flat map.
  for (const node of resolved.existsMap?.values() ?? []) {
    placeInto(node, policy);
  }

  placeInto(resolved, policy);
  return resolved;
};

/**
 * @deprecated Checks access only and returns the query as it came, with no row
 * rule added. Use `checkScope`; row rules are placed by `scopeResolved`, on the
 * resolved query.
 */
export const applyScope = (dsl: Query, entities: Set<string>, policy: ScopePolicy): Query => {
  checkScope(entities, policy);
  return dsl;
};
