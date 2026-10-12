import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ResolvedQuery, ResolvedFilter, ResolvedSource, ResolvedJoin } from '../engine/engine.types.js';
import type { ScopePolicy, ScopeEntityRule, ScopeMatch } from './scope.types.js';
import { isSetMatch } from './scope.types.js';
import { VexError } from '../errors.js';

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

const matchesFor = (entity: string, rule: ScopeEntityRule | undefined, def: 'allow' | 'deny'): ScopeMatch[] => {
  if (rule === undefined) {
    if (def === 'deny') throw new VexScopeError(entity, `Entity "${entity}" is not allowed by scope policy (default: deny)`);
    return [];
  }
  if ('public' in rule) return [];
  if ('deny' in rule) throw new VexScopeError(entity, `Entity "${entity}" is denied by scope policy`);
  if (rule.read === undefined) {
    if (def === 'deny') throw new VexScopeError(entity, `Reads of "${entity}" are not allowed by scope policy (default: deny)`);
    return [];
  }
  return rule.read;
};

export const canReadTable = (policy: ScopePolicy, table: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  return rule.read !== undefined || policy.default === 'allow';
};

export const checkScope = (entities: Set<string>, policy: ScopePolicy): void => {
  for (const entity of entities) matchesFor(entity, policy.entities[entity], policy.default);
};

const andMerge = (existing: ResolvedFilter | undefined, additions: ResolvedFilter[]): ResolvedFilter | undefined => {
  if (additions.length === 0) return existing;
  const all = existing === undefined ? additions : [existing, ...additions];
  if (all.length === 1) return all[0];

  const paths = new Map<string, { alias: string; column: string; schema: never }>();
  for (const part of all) for (const [key, value] of part.resolvedPaths) paths.set(key, value as never);
  return { original: { and: all.map((f) => f.original) }, resolvedPaths: paths as never };
};

const predicateFor = (
  entityName: string,
  alias: string,
  match: ScopeMatch,
  fields: { name: string; nullable: boolean }[],
): ResolvedFilter | undefined => {
  const field = fields.find((f) => f.name === match.match);
  // Fails closed: a rule naming a missing column must not let the read run without it.
  if (field === undefined) throw new VexScopeError(entityName, `Scope rule for "${entityName}" names column "${match.match}", which the table does not have`);
  const path = `${entityName}.${match.match}`;
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
    for (const match of matchesFor(entity.name, policy.entities[entity.name], policy.default)) {
      const predicate = predicateFor(entity.name, source.alias, match, entity.fields);
      if (predicate === undefined) continue;

      // The compiler resolves `entity.column` through the alias map, and these
      // predicates did not go through the resolver's field pass.
      level.aliasMap.set(`${entity.name}.${match.match}`, `${source.alias}.${match.match}`);

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

export const applyScope = (dsl: Query, entities: Set<string>, policy: ScopePolicy): Query => {
  checkScope(entities, policy);
  return dsl;
};
