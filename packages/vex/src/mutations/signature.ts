import type { Query } from '../schemas/query.schema.js';
import type { Filter } from '../schemas/filter.schema.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { Mutation, MutationDefinition, CoreMutation } from './schema.js';

// ═══════════════════════════════════════════════════════════════
// Context signatures — the derived input contract of a cache entry.
//
// A fingerprint hides the def; the def contains `{ $context }` refs; the refs
// sit at positions whose column types the schema knows. So the contract of
// "what do I pass this fingerprint" is COMPUTED from the artifact — walked
// out of the stored DSL/def — never authored, and therefore never stale.
// Discovery serves it; the mutation error path teaches it.
// ═══════════════════════════════════════════════════════════════

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

// First specific description wins; a later, better-typed sighting upgrades an
// 'unknown' one. Notes stick once set.
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

// Last-resort sweep: find `{ $context }` anywhere in a value (compute args,
// exotic filter ops) and record the key with an unknown type.
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

// Comparison positions pair a field path with a value — when the value is a
// `{ $context }` ref, the path's column gives the ref its type.
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
  // isNull / isNotNull carry no values; semantic/fuzzy and anything future get
  // the generic sweep so no ref is ever silently dropped.
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

export const collectMutationContext = (def: MutationDefinition, schema?: DatabaseSchema): ContextSignature => {
  const sig: ContextSignature = {};
  const list = Array.isArray(def) ? def : [def];
  for (const m of list) {
    for (const [col, v] of Object.entries(columnsOf(m))) {
      if (isLookupRef(v)) {
        // The lookup's WHERE binds context like any filter does.
        walkFilter(v.$lookup.where, schema, sig);
        continue;
      }
      if (!isContextRef(v)) continue;
      const insertOnly = m.op === 'upsert' && m.insert !== undefined && col in m.insert;
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
    // ON CONFLICT DO UPDATE also updates — declare it, so visibility and
    // grants treat the entry as the insert-plus-update it really is.
    const conflictSet = (m.op === 'insert' || m.op === 'insertEach') && m.onConflict?.set !== undefined ? m.onConflict.set : undefined;
    if (conflictSet === undefined) return [base];
    return [base, { op: 'update', table: m.table, columns: Object.keys(conflictSet).sort() }];
  });
};

// The keys a DESUGARED core mutation actually binds — the hard requirement
// checked before execution (an upsert's absent key is legal: it selects the
// insert branch, so requirement is computed after desugaring).
export const requiredContextKeys = (m: CoreMutation): string[] => {
  const keys = new Set<string>();
  const cols = m.op === 'insert' || m.op === 'insertEach' ? { ...m.values, ...(m.onConflict?.set ?? {}) } : m.op === 'update' ? m.set : {};
  for (const v of Object.values(cols)) {
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

// Authoring lint (run by the seed path): an update/delete whose WHERE binds no
// `$context` is not caller-bounded — its only row limit is the scope policy.
// Loud at boot, never at runtime.
// An `optional` condition is a READ construct. In a WHERE it would mean "this
// bound disappears when the caller omits a key" — which is precisely the
// unkeyed update the lint below exists to refuse, only reachable by omission
// rather than by authoring. Writes keep the rule they have always had: every
// key is mandatory, and a missing one is a hard `missing_context` (see
// mutations/engine.ts), never a wider statement.
const findOptional = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(findOptional);
  if (value === null || typeof value !== 'object') return false;
  if ('optional' in value) return true;
  return Object.values(value).some(findOptional);
};

// ─── `$returned` — which earlier statement a reference reads ───
// Decided from the statement list alone, so the seed lint and the engine share
// one rule and cannot drift: a reference names a table, and exactly one EARLIER
// statement of the batch must write it. The row count is the engine's to check
// when the value is bound; what is refused here is a reference that could
// never hold — nothing earlier to read, two candidates, or a statement built
// to return several rows or, on a conflict, none.
export type ReturnedSource = { statement: number; table: string; column: string };

// Every value a statement sets, position by position. NOT `columnsOf`: that
// merges an insert's `values` with its `onConflict.set` by column name, and a
// reference in one would go unseen behind the same column in the other.
const valuesSetBy = (m: Mutation): unknown[] =>
  m.op === 'insert' || m.op === 'insertEach'
    ? [...Object.values(m.values), ...Object.values(m.onConflict?.set ?? {})]
    : m.op === 'update'
      ? Object.values(m.set)
      : m.op === 'upsert'
        ? [...Object.values(m.columns), ...Object.values(m.insert ?? {})]
        : [];

const isReturnedRef = (v: unknown): v is { $returned: string } =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && '$returned' in v && typeof v.$returned === 'string';

export const returnedIn = (list: readonly Mutation[], at: number): { refs: Map<string, ReturnedSource>; issues: string[] } => {
  const refs = new Map<string, ReturnedSource>();
  const issues: string[] = [];
  const m = list[at];
  if (m === undefined) return { refs, issues };
  // A reference a statement uses for several columns is judged once.
  const judged = new Set<string>();
  for (const v of valuesSetBy(m)) {
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
