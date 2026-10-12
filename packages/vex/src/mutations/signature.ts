import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { Mutation, MutationDefinition, CoreMutation } from './schema.js';

export type ContextField = { type: string; column?: string; note?: string };
export type ContextSignature = Record<string, ContextField>;
export type MutationEffect = { op: Mutation['op']; table: string; columns: string[] };

const isContextRef = (v: unknown): v is { $context: string } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (v as Record<string, unknown>)['$context'] === 'string';

const columnInfo = (path: string, schema: DatabaseSchema | undefined): ContextField => {
  const [table, field] = path.split('.');
  const entity = schema?.entities.find((e) => e.table === table || e.name === table);
  const f = entity?.fields.find((x) => x.name === field);
  return { type: f?.normalizedType ?? 'unknown', column: path };
};

const addField = (sig: ContextSignature, key: string, field: ContextField): void => {
  const existing = sig[key];
  if (existing === undefined) {
    sig[key] = field;
    return;
  }
  if (existing.type === 'unknown' && field.type !== 'unknown') {
    sig[key] = { ...field, ...(existing.note !== undefined ? { note: existing.note } : {}) };
  }
};

const deepScan = (value: unknown, sig: ContextSignature): void => {
  if (isContextRef(value)) {
    addField(sig, value.$context, { type: 'unknown' });
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) deepScan(v, sig);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepScan(v, sig);
  }
};

const COMPARISONS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

const walkFilter = (filter: Filter, schema: DatabaseSchema | undefined, sig: ContextSignature): void => {
  const f = filter as Record<string, unknown>;
  for (const op of COMPARISONS) {
    const pair = f[op];
    if (Array.isArray(pair) && pair.length === 2) {
      const [a, b] = pair as [unknown, unknown];
      if (typeof a === 'string' && isContextRef(b)) addField(sig, b.$context, columnInfo(a, schema));
      else if (typeof b === 'string' && isContextRef(a)) addField(sig, a.$context, columnInfo(b, schema));
      else deepScan(pair, sig);
      return;
    }
  }
  if ('in' in f || 'notIn' in f) {
    const [path, target] = (f['in'] ?? f['notIn']) as [string, unknown];
    if (isContextRef(target)) addField(sig, target.$context, { ...columnInfo(path, schema), type: `${columnInfo(path, schema).type}[]` });
    else deepScan(target, sig);
    return;
  }
  if ('like' in f || 'ilike' in f) {
    const [path, v] = (f['like'] ?? f['ilike']) as [string, unknown];
    if (isContextRef(v)) addField(sig, v.$context, { type: 'string', column: path, note: 'pattern' });
    return;
  }
  if ('and' in f || 'or' in f) {
    for (const sub of (f['and'] ?? f['or']) as Filter[]) walkFilter(sub, schema, sig);
    return;
  }
  if ('not' in f) {
    walkFilter(f['not'] as Filter, schema, sig);
    return;
  }
  deepScan(f, sig);
};

const isLookupRef = (v: unknown): v is { $lookup: { from: string; field: string; where: Filter } } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$lookup' in v;

const columnsOf = (m: Mutation): Record<string, unknown> =>
  m.op === 'insert' || m.op === 'insertEach'
    ? { ...m.values, ...(m.onConflict?.set ?? {}) }
    : m.op === 'update'
      ? m.set
      : m.op === 'upsert'
        ? { ...m.columns, ...(m.insert ?? {}) }
        : {};

// Not `columnsOf`: it merges the two halves of a statement by column name, so
// a `$context` key or a `$returned` in one half would go unseen behind the other.
type SetPosition = { column: string; value: unknown; insertOnly: boolean };

const positionsSetBy = (m: Mutation): SetPosition[] => {
  const positions = (cols: Record<string, unknown> | undefined, insertOnly = false): SetPosition[] =>
    Object.entries(cols ?? {}).map(([column, value]) => ({ column, value, insertOnly }));
  if (m.op === 'insert' || m.op === 'insertEach') return [...positions(m.values), ...positions(m.onConflict?.set)];
  if (m.op === 'update') return positions(m.set);
  if (m.op === 'upsert') return [...positions(m.columns), ...positions(m.insert, true)];
  return [];
};

export const collectMutationContext = (def: MutationDefinition, schema?: DatabaseSchema): ContextSignature => {
  const sig: ContextSignature = {};
  const list = Array.isArray(def) ? def : [def];
  for (const m of list) {
    for (const { column: col, value: v, insertOnly } of positionsSetBy(m)) {
      if (isLookupRef(v)) {
        walkFilter(v.$lookup.where, schema, sig);
        continue;
      }
      if (!isContextRef(v)) continue;
      addField(sig, v.$context, { ...columnInfo(`${m.table}.${col}`, schema), ...(insertOnly ? { note: 'insert only' } : {}) });
    }
    if (m.op === 'update' || m.op === 'delete') walkFilter(m.where, schema, sig);
    if (m.op === 'insertEach') {
      const itemKeys = Object.values(m.values)
        .filter((v): v is { $item: string } => v !== null && typeof v === 'object' && '$item' in v)
        .map((v) => v.$item);
      sig[m.items.$context] = { type: 'json', note: `array of objects — one inserted row per element${itemKeys.length > 0 ? ` (keys: ${itemKeys.join(', ')})` : ''}` };
    }
    if (m.op === 'upsert') {
      sig[m.key] = { ...columnInfo(`${m.table}.${m.key}`, schema), note: 'upsert key — present updates that row, absent/empty inserts' };
    }
  }
  return sig;
};

export const collectQueryContext = (dsl: Query, schema?: DatabaseSchema): ContextSignature => {
  const sig: ContextSignature = {};
  const walkQuery = (q: Query): void => {
    for (const source of q.from) {
      if (typeof source !== 'string') walkQuery(source.query);
    }
    if (q.filter !== undefined) walkFilter(q.filter, schema, sig);
    if (q.compute !== undefined) deepScan(q.compute, sig);
    if (q.aggregate !== undefined) deepScan(q.aggregate, sig);
  };
  walkQuery(dsl);
  return sig;
};

export const mutationEffect = (def: MutationDefinition): MutationEffect[] => {
  const list = Array.isArray(def) ? def : [def];
  return list.flatMap((m) => {
    const base: MutationEffect = { op: m.op, table: m.table, columns: Object.keys(columnsOf(m)).sort() };
    const conflictSet = (m.op === 'insert' || m.op === 'insertEach') && m.onConflict?.set !== undefined ? m.onConflict.set : undefined;
    if (conflictSet === undefined) return [base];
    return [base, { op: 'update', table: m.table, columns: Object.keys(conflictSet).sort() }];
  });
};

export const requiredContextKeys = (m: CoreMutation): string[] => {
  const keys = new Set<string>();
  for (const { value: v } of positionsSetBy(m)) {
    if (isContextRef(v)) keys.add(v.$context);
    else if (isLookupRef(v)) {
      const sub: ContextSignature = {};
      deepScan(v.$lookup.where, sub);
      for (const k of Object.keys(sub)) keys.add(k);
    }
  }
  if (m.op === 'insertEach') keys.add(m.items.$context);
  if (m.op === 'update' || m.op === 'delete') {
    const sub: ContextSignature = {};
    deepScan(m.where, sub);
    for (const k of Object.keys(sub)) keys.add(k);
  }
  return [...keys].sort();
};

const findOptional = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(findOptional);
  if (value === null || typeof value !== 'object') return false;
  if ('optional' in value) return true;
  return Object.values(value).some(findOptional);
};

export type ReturnedSource = { statement: number; table: string; column: string };

const isReturnedRef = (v: unknown): v is { $returned: string } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$returned' in v && typeof v.$returned === 'string';

export const returnedIn = (list: readonly Mutation[], at: number): { refs: Map<string, ReturnedSource>; issues: string[] } => {
  const refs = new Map<string, ReturnedSource>();
  const issues: string[] = [];
  const m = list[at];
  if (m === undefined) return { refs, issues };
  const judged = new Set<string>();
  for (const { value: v } of positionsSetBy(m)) {
    if (!isReturnedRef(v) || judged.has(v.$returned)) continue;
    judged.add(v.$returned);
    const dot = v.$returned.indexOf('.');
    const table = v.$returned.slice(0, dot);
    const column = v.$returned.slice(dot + 1);
    const reads = `${m.op} on "${m.table}" reads "${v.$returned}"`;
    const earlier = list.flatMap((s, i) => (i < at && s.table === table ? [{ s, i }] : []));
    const source = earlier[0];
    if (source === undefined) {
      issues.push(`${reads}, and no earlier statement writes "${table}" — put the statement that writes it before this one, in the same batch`);
    } else if (earlier.length > 1) {
      issues.push(`${reads}, and ${earlier.length} earlier statements write "${table}" — a reference cannot tell them apart`);
    } else if (source.s.op === 'insertEach') {
      issues.push(`${reads} from an insertEach, which writes a row per element — there is no one row to read`);
    } else if (source.s.op === 'insert' && source.s.onConflict !== undefined && source.s.onConflict.set === undefined) {
      issues.push(`${reads} from an insert that does nothing on conflict, which then returns no row — give its onConflict a \`set\``);
    } else {
      refs.set(v.$returned, { statement: source.i, table, column });
    }
  }
  return { refs, issues };
};

export const lintMutation = (def: MutationDefinition): string[] => {
  const issues: string[] = [];
  const list = Array.isArray(def) ? def : [def];
  list.forEach((_m, at) => issues.push(...returnedIn(list, at).issues));
  for (const m of list) {
    if (findOptional(m)) {
      issues.push(`${m.op} on "${m.table}" contains an optional condition — a write's bounds cannot depend on what the caller chose to send`);
    }
    if (m.op !== 'update' && m.op !== 'delete') continue;
    const sub: ContextSignature = {};
    deepScan(m.where, sub);
    if (Object.keys(sub).length === 0) {
      issues.push(`${m.op} on "${m.table}" has no $context-keyed WHERE — the write is not caller-bounded`);
    }
  }
  return issues;
};
