import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { ComputeExpression } from '../schemas/compute.schema.js';
import type { AggregateExpression } from '../schemas/aggregate.schema.js';
import type { FieldOrValue } from '../schemas/value.schema.js';
import { refuseOptional } from './optional.js';
import type { DatabaseSchema, EntitySchema, FieldSchema, NormalizedType } from '../schemas/database.schema.js';
import type {
  ResolvedQuery,
  ResolvedSource,
  ResolvedField,
  ResolvedJoin,
  ResolvedFilter,
  ResolvedSemantic,
  ResolvedExists,
} from './engine.types.js';
import { VexError } from '../errors.js';
import { isFieldPathShape, isIdentifier } from '../schemas/identifier.schema.js';

const levenshtein = (a: string, b: string): number => {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array<number>(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevJ = prev[j] ?? 0;
      const currJ1 = curr[j - 1] ?? 0;
      const prevJ1 = prev[j - 1] ?? 0;
      curr[j] = Math.min(prevJ + 1, currJ1 + 1, prevJ1 + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[lb] ?? 0;
};

const findClosest = (target: string, candidates: string[]): string | undefined => {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(target.toLowerCase(), c.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  if (bestDist <= Math.max(3, Math.ceil(target.length / 2))) {
    return best;
  }
  return undefined;
};

type AliasCounter = Map<string, number>;

const generateAlias = (name: string, counter: AliasCounter): string => {
  const prefix = name.charAt(0).toLowerCase();
  const current = counter.get(prefix) ?? 0;
  const next = current + 1;
  counter.set(prefix, next);
  return `${prefix}${next}`;
};

const findEntity = (name: string, schema: DatabaseSchema): EntitySchema => {
  const found = schema.entities.find((e) => e.name === name);
  if (found !== undefined) return found;

  const allNames = schema.entities.map((e) => e.name);
  const suggestion = findClosest(name, allNames);
  const hint = suggestion !== undefined ? ` Did you mean "${suggestion}"?` : '';
  throw new VexError(
    'invalid_dsl',
    `Entity "${name}" not found in schema.${hint}`,
    { suggestion, options: allNames },
  );
};

const findField = (fieldName: string, entity: EntitySchema): FieldSchema => {
  const found = entity.fields.find((f) => f.name === fieldName);
  if (found !== undefined) return found;

  const allFields = entity.fields.map((f) => f.name);
  const suggestion = findClosest(fieldName, allFields);
  const hint = suggestion !== undefined ? ` Did you mean "${suggestion}"?` : '';
  throw new VexError(
    'invalid_dsl',
    `Field "${fieldName}" not found on entity "${entity.name}".${hint} Available fields: ${allFields.join(', ')}`,
    { suggestion, options: allFields },
  );
};

const parsePath = (path: string): { entity: string; field: string } => {
  if (!isFieldPathShape(path)) {
    throw new VexError(
      'invalid_dsl',
      `Invalid field path "${path}". Expected format: entity.field`,
    );
  }
  const dotIndex = path.indexOf('.');
  return {
    entity: path.substring(0, dotIndex),
    field: path.substring(dotIndex + 1),
  };
};

// An authored name (an output alias, a compute or aggregate key, a subquery
// alias) becomes SQL text. The schema holds it to the same grammar; this holds
// a DSL that skipped the schema (`engine.compile`, `engine.test`).
const assertName = (name: string, what: string): void => {
  if (!isIdentifier(name)) {
    throw new VexError('invalid_dsl', `Invalid ${what} "${name}": letters, digits and underscores, not starting with a digit.`);
  }
};

const findJoinBetween = (
  fromEntity: EntitySchema,
  toEntity: EntitySchema,
  fromAlias: string,
  toAlias: string,
): ResolvedJoin | undefined => {
  // LEFT when any of this side's join columns is nullable, so a null never
  // drops its row. Any of them: a composite foreign key is MATCH SIMPLE by
  // default, unenforced once one column is null.
  for (const rel of fromEntity.relations) {
    if (rel.entity === toEntity.name) {
      const fkNullable = rel.localFields.some(
        (column) => fromEntity.fields.find((f) => f.name === column)?.nullable === true,
      );
      return {
        fromAlias,
        fromColumns: rel.localFields,
        toAlias,
        toColumns: rel.foreignFields,
        toTable: toEntity.table,
        kind: fkNullable ? 'left' : 'inner',
      };
    }
  }

  for (const rel of toEntity.relations) {
    if (rel.entity === fromEntity.name) {
      return {
        fromAlias,
        fromColumns: rel.foreignFields,
        toAlias,
        toColumns: rel.localFields,
        toTable: toEntity.table,
        kind: 'inner',
      };
    }
  }

  return undefined;
};

type PathResolution = { alias: string; column: string; schema: FieldSchema };
type EntityLookup = Map<string, { entity: EntitySchema; alias: string }>;

const resolveFieldPath = (
  path: string,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
): { resolved: ResolvedField; entityName: string } => {
  const parsed = parsePath(path);
  const lookup = entityLookup.get(parsed.entity);

  if (lookup === undefined) {
    const entityExists = schema.entities.some((e) => e.name === parsed.entity);
    if (entityExists) {
      throw new VexError(
        'invalid_dsl',
        `Entity "${parsed.entity}" is referenced in field path "${path}" but not listed in "from"`,
      );
    }
    const allNames = schema.entities.map((e) => e.name);
    const suggestion = findClosest(parsed.entity, allNames);
    const hint = suggestion !== undefined ? ` Did you mean "${suggestion}"?` : '';
    throw new VexError(
      'invalid_dsl',
      `Entity "${parsed.entity}" not found in schema.${hint}`,
      { suggestion, options: allNames },
    );
  }

  const fieldSchema = findField(parsed.field, lookup.entity);

  return {
    resolved: {
      path,
      alias: lookup.alias,
      column: fieldSchema.name,
      outputName: parsed.field,
      schema: fieldSchema,
    },
    entityName: parsed.entity,
  };
};

const isFieldPath = isFieldPathShape;

const collectFilterPaths = (
  filter: Filter,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
  resolvedPaths: Map<string, PathResolution>,
  existsOut?: Map<object, ResolvedExists>,
  aliasCounter?: AliasCounter,
): void => {
  if ('eq' in filter || 'neq' in filter || 'gt' in filter || 'gte' in filter || 'lt' in filter || 'lte' in filter) {
    const pair = ('eq' in filter) ? filter.eq
      : ('neq' in filter) ? filter.neq
      : ('gt' in filter) ? filter.gt
      : ('gte' in filter) ? filter.gte
      : ('lt' in filter) ? filter.lt
      : filter.lte;
    resolveFilterFieldOrValue(pair[0], entityLookup, schema, resolvedPaths);
    resolveFilterFieldOrValue(pair[1], entityLookup, schema, resolvedPaths);
    return;
  }

  if ('in' in filter || 'notIn' in filter) {
    const tuple = 'in' in filter ? filter.in : filter.notIn;
    resolveFilterFieldPath(tuple[0], entityLookup, schema, resolvedPaths);
    const target = tuple[1];
    if (Array.isArray(target)) {
      for (const v of target) {
        resolveFilterFieldOrValue(v, entityLookup, schema, resolvedPaths);
      }
    }
    return;
  }

  if ('like' in filter || 'ilike' in filter) {
    const tuple = 'like' in filter ? filter.like : filter.ilike;
    resolveFilterFieldPath(tuple[0], entityLookup, schema, resolvedPaths);
    resolveFilterFieldOrValue(tuple[1], entityLookup, schema, resolvedPaths);
    return;
  }

  if ('isNull' in filter) {
    resolveFilterFieldPath(filter.isNull, entityLookup, schema, resolvedPaths);
    return;
  }

  if ('isNotNull' in filter) {
    resolveFilterFieldPath(filter.isNotNull, entityLookup, schema, resolvedPaths);
    return;
  }

  // The inner lookup is layered over the outer one: a path the subquery does
  // not own resolves to the outer query, and that is the correlation.
  if ('exists' in filter) {
    if (existsOut === undefined || aliasCounter === undefined) return;
    const inner: EntityLookup = new Map(entityLookup);
    const innerSources: ResolvedSource[] = [];
    const innerEntities: Array<{ entity: EntitySchema; alias: string }> = [];
    const innerJoins: ResolvedJoin[] = [];
    const innerAliasMap = new Map<string, string>();

    for (const name of filter.exists.from) {
      const entity = findEntity(name, schema);
      // The alias counter is shared with the outer query, so an inner `rooms`
      // never takes an outer one's alias and correlates a table with itself.
      const alias = generateAlias(name, aliasCounter);
      inner.set(name, { entity, alias });
      innerSources.push({ alias, entity, table: entity.table });
      innerEntities.push({ entity, alias });
    }

    for (let i = 1; i < innerEntities.length; i += 1) {
      const curr = innerEntities[i];
      if (curr === undefined) continue;
      let found = false;
      for (let j = 0; j < i; j += 1) {
        const earlier = innerEntities[j];
        if (earlier === undefined) continue;
        const join = findJoinBetween(earlier.entity, curr.entity, earlier.alias, curr.alias);
        if (join !== undefined) {
          innerJoins.push(join);
          found = true;
          break;
        }
      }
      if (!found) throw new VexError('invalid_dsl', `No foreign key relationship found between the entities of an "exists" and "${curr.entity.name}".`);
    }

    let innerFilter: ResolvedFilter | undefined;
    if (filter.exists.filter !== undefined) {
      const innerPaths = new Map<string, PathResolution>();
      collectFilterPaths(filter.exists.filter, inner, schema, innerPaths, existsOut, aliasCounter);
      innerFilter = { original: filter.exists.filter, resolvedPaths: innerPaths };
      for (const [path, res] of innerPaths) {
        const owner = path.slice(0, path.indexOf('.'));
        if (filter.exists.from.includes(owner)) innerAliasMap.set(path, `${res.alias}.${res.column}`);
        else resolvedPaths.set(path, res);
      }
    }

    existsOut.set(filter.exists, { sources: innerSources, joins: innerJoins, filter: innerFilter, aliasMap: innerAliasMap });
    return;
  }

  if ('and' in filter) {
    for (const sub of filter.and) {
      collectFilterPaths(sub, entityLookup, schema, resolvedPaths, existsOut, aliasCounter);
    }
    return;
  }

  if ('or' in filter) {
    for (const sub of filter.or) {
      collectFilterPaths(sub, entityLookup, schema, resolvedPaths, existsOut, aliasCounter);
    }
    return;
  }

  if ('not' in filter) {
    collectFilterPaths(filter.not, entityLookup, schema, resolvedPaths, existsOut, aliasCounter);
    return;
  }

  if ('semantic' in filter) {
    resolveFilterFieldPath(filter.semantic.field, entityLookup, schema, resolvedPaths);
    return;
  }

  if ('fuzzy' in filter) {
    resolveFilterFieldPath(filter.fuzzy.field, entityLookup, schema, resolvedPaths);
    return;
  }

  if ('optional' in filter) refuseOptional('field resolution');
};

const resolveFilterFieldPath = (
  path: string,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
  resolvedPaths: Map<string, PathResolution>,
): void => {
  if (resolvedPaths.has(path)) return;
  const { resolved } = resolveFieldPath(path, entityLookup, schema);
  resolvedPaths.set(path, { alias: resolved.alias, column: resolved.column, schema: resolved.schema });
};

const resolveFilterFieldOrValue = (
  fov: FieldOrValue,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
  resolvedPaths: Map<string, PathResolution>,
): void => {
  if (typeof fov === 'string' && isFieldPath(fov)) {
    resolveFilterFieldPath(fov, entityLookup, schema, resolvedPaths);
  }
};

const extractSemantic = (
  filter: Filter,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
): ResolvedSemantic | undefined => {
  if ('semantic' in filter) {
    const { resolved } = resolveFieldPath(filter.semantic.field, entityLookup, schema);
    const queryRef = filter.semantic.query;
    const contextPath = '$context' in queryRef ? queryRef.$context : queryRef.$scope;
    return {
      field: resolved,
      contextPath,
      minScore: filter.semantic.minScore,
    };
  }

  if ('and' in filter) {
    for (const sub of filter.and) {
      const result = extractSemantic(sub, entityLookup, schema);
      if (result !== undefined) return result;
    }
  }

  if ('or' in filter) {
    for (const sub of filter.or) {
      const result = extractSemantic(sub, entityLookup, schema);
      if (result !== undefined) return result;
    }
  }

  if ('not' in filter) {
    return extractSemantic(filter.not, entityLookup, schema);
  }

  return undefined;
};

export const resolve = (dsl: Query, schema: DatabaseSchema): ResolvedQuery => {
  const aliasCounter: AliasCounter = new Map();
  const entityLookup: EntityLookup = new Map();
  const aliasMap = new Map<string, string>();
  const sources: ResolvedSource[] = [];
  const joins: ResolvedJoin[] = [];

  const entitySources: Array<{ entity: EntitySchema; alias: string }> = [];

  for (const source of dsl.from) {
    if (typeof source === 'string') {
      const entity = findEntity(source, schema);
      const alias = generateAlias(source, aliasCounter);

      entityLookup.set(source, { entity, alias });
      sources.push({ alias, entity, table: entity.table });
      entitySources.push({ entity, alias });
    } else {
      assertName(source.as, 'subquery alias');
      const subResolved = resolve(source.query, schema);
      const alias = source.as;

      const synthField = (name: string, normalizedType: NormalizedType): FieldSchema => ({
        name,
        type: normalizedType,
        normalizedType,
        nullable: true,
        primaryKey: false,
      });
      const syntheticFields: FieldSchema[] = [
        ...subResolved.fields.map((f) => ({ ...f.schema, name: f.outputName })),
        ...subResolved.computes.map((c) => synthField(c.name, 'unknown')),
        ...subResolved.aggregates.map((a) => synthField(a.name, 'number')),
      ];
      const syntheticEntity: EntitySchema = {
        name: alias,
        table: alias,
        fields: syntheticFields,
        relations: [],
        indexes: [],
      };

      entityLookup.set(alias, { entity: syntheticEntity, alias });
      sources.push({ alias, subquery: subResolved });
    }
  }

  for (let i = 1; i < entitySources.length; i++) {
    const prev = entitySources[i - 1];
    const curr = entitySources[i];
    if (prev === undefined || curr === undefined) continue;

    let joinFound = false;
    for (let j = 0; j < i; j++) {
      const earlier = entitySources[j];
      if (earlier === undefined) continue;

      const join = findJoinBetween(earlier.entity, curr.entity, earlier.alias, curr.alias);
      if (join !== undefined) {
        joins.push(join);
        joinFound = true;
        break;
      }
    }

    if (!joinFound) {
      throw new VexError(
        'invalid_dsl',
        `No foreign key relationship found between any previous entity and "${curr.entity.name}". Cannot determine join condition.`,
      );
    }
  }

  const fields: ResolvedField[] = [];
  for (const ref of dsl.fields ?? []) {
    const path = typeof ref === 'string' ? ref : ref.field;
    if (typeof ref !== 'string') assertName(ref.as, 'field alias');
    const { resolved } = resolveFieldPath(path, entityLookup, schema);
    fields.push(typeof ref === 'string' ? resolved : { ...resolved, outputName: ref.as });
    aliasMap.set(path, `${resolved.alias}.${resolved.column}`);
  }

  let resolvedFilter: ResolvedFilter | undefined;
  let semantic: ResolvedSemantic | undefined;

  const existsMap = new Map<object, ResolvedExists>();

  if (dsl.filter !== undefined) {
    const resolvedPaths = new Map<string, PathResolution>();
    collectFilterPaths(dsl.filter, entityLookup, schema, resolvedPaths, existsMap, aliasCounter);
    resolvedFilter = { original: dsl.filter, resolvedPaths };

    for (const [path, res] of resolvedPaths) {
      aliasMap.set(path, `${res.alias}.${res.column}`);
    }

    semantic = extractSemantic(dsl.filter, entityLookup, schema);
  }

  const computes: Array<{ name: string; expression: ComputeExpression }> = [];
  if (dsl.compute !== undefined) {
    for (const [name, expr] of Object.entries(dsl.compute)) {
      if (expr !== undefined) {
        assertName(name, 'compute name');
        resolveComputePaths(expr, entityLookup, schema, aliasMap, existsMap, aliasCounter);
        computes.push({ name, expression: expr });
      }
    }
  }

  const aggregates: Array<{ name: string; expression: AggregateExpression }> = [];
  if (dsl.aggregate !== undefined) {
    for (const [name, expr] of Object.entries(dsl.aggregate)) {
      if (expr !== undefined) {
        assertName(name, 'aggregate name');
        resolveAggregatePaths(expr, entityLookup, schema, aliasMap);
        aggregates.push({ name, expression: expr });
      }
    }
  }

  const groupBy: ResolvedField[] = [];
  if (dsl.groupBy !== undefined) {
    for (const path of dsl.groupBy) {
      const { resolved } = resolveFieldPath(path, entityLookup, schema);
      groupBy.push(resolved);
      aliasMap.set(path, `${resolved.alias}.${resolved.column}`);
    }
  }

  const sort: Array<{ field: ResolvedField | string; dir: 'asc' | 'desc' }> = [];
  if (dsl.sort !== undefined) {
    const computeNames = new Set(computes.map((c) => c.name));
    const aggregateNames = new Set(aggregates.map((a) => a.name));

    for (const entry of dsl.sort) {
      const dir = entry.dir ?? 'asc';

      if (computeNames.has(entry.field) || aggregateNames.has(entry.field)) {
        sort.push({ field: entry.field, dir });
      } else {
        const { resolved } = resolveFieldPath(entry.field, entityLookup, schema);
        aliasMap.set(entry.field, `${resolved.alias}.${resolved.column}`);
        sort.push({ field: resolved, dir });
      }
    }
  }

  return {
    sources,
    joins,
    fields,
    filter: resolvedFilter,
    semantic,
    computes,
    aggregates,
    groupBy,
    sort,
    limit: dsl.limit,
    distinct: dsl.distinct ?? false,
    aliasMap,
    ...(existsMap.size > 0 ? { existsMap } : {}),
  };
};

const resolveComputePaths = (
  expr: ComputeExpression,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
  aliasMap: Map<string, string>,
  existsOut?: Map<object, ResolvedExists>,
  aliasCounter?: AliasCounter,
): void => {
  const resolveFieldOrValue = (fov: FieldOrValue): void => {
    if (typeof fov === 'string' && isFieldPath(fov)) {
      if (!aliasMap.has(fov)) {
        const { resolved } = resolveFieldPath(fov, entityLookup, schema);
        aliasMap.set(fov, `${resolved.alias}.${resolved.column}`);
      }
    }
  };

  if ('add' in expr || 'subtract' in expr || 'multiply' in expr || 'divide' in expr) {
    const pair = ('add' in expr) ? expr.add
      : ('subtract' in expr) ? expr.subtract
      : ('multiply' in expr) ? expr.multiply
      : expr.divide;
    resolveFieldOrValue(pair[0]);
    resolveFieldOrValue(pair[1]);
    return;
  }

  if ('concat' in expr) {
    for (const v of expr.concat) resolveFieldOrValue(v);
    return;
  }

  if ('coalesce' in expr) {
    for (const v of expr.coalesce) resolveFieldOrValue(v);
    return;
  }

  if ('case' in expr) {
    for (const when of expr.case.when) {
      const resolvedPaths = new Map<string, PathResolution>();
      collectFilterPaths(when.condition, entityLookup, schema, resolvedPaths, existsOut, aliasCounter);
      for (const [path, res] of resolvedPaths) {
        aliasMap.set(path, `${res.alias}.${res.column}`);
      }
      resolveFieldOrValue(when.then);
    }
    resolveFieldOrValue(expr.case.else);
  }
};

const resolveAggregatePaths = (
  expr: AggregateExpression,
  entityLookup: EntityLookup,
  schema: DatabaseSchema,
  aliasMap: Map<string, string>,
): void => {
  const arg = ('count' in expr) ? expr.count
    : ('countDistinct' in expr) ? expr.countDistinct
    : ('sum' in expr) ? expr.sum
    : ('avg' in expr) ? expr.avg
    : ('min' in expr) ? expr.min
    : expr.max;

  if (arg === '*') return;

  if (typeof arg !== 'string') {
    resolveComputePaths(arg, entityLookup, schema, aliasMap);
    return;
  }

  if (!aliasMap.has(arg)) {
    const { resolved } = resolveFieldPath(arg, entityLookup, schema);
    aliasMap.set(arg, `${resolved.alias}.${resolved.column}`);
  }
};
