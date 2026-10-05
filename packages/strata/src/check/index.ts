import type { Sequence } from '../schema';
import type { Stamp, Upgrader } from '../documents';
import { StrataError } from '../errors';

// ═══════════════════════════════════════════════════════════════
// @niscorp/strata/check — the gate a grammar change has to pass.
//
// Two questions, both mechanical:
//
//   1. SNAPSHOT — did a kind's schema change without the grammar gaining a
//      migration? Each kind's JSON Schema, taken through the schema's OWN
//      Standard JSON Schema hook, is recorded per grammar version. Same version,
//      different schema: something changed that older readers were never told.
//      Append a migration (an empty marker is enough for an addition — strict
//      readers still have to refuse the newer documents), then record the new
//      version.
//
//   2. CORPUS — does every real document ever captured, at the stamp it was
//      captured at, still upgrade to the current grammar and pass the current
//      strict schema? This is the judge: a snapshot only says something moved,
//      the corpus says whether old documents survive it. No JSON Schema diff
//      tool is trusted to decide compatibility.
//
// Pure: no files, no process. A host reads and writes snapshots where it keeps
// them (nisc's own live in the repo's `strata/` directory).
// ═══════════════════════════════════════════════════════════════

type Issue = { message: string; path?: readonly (PropertyKey | { key: PropertyKey })[] };
type StandardResult = { value: unknown; issues?: undefined } | { issues: readonly Issue[] };

// Any validator implementing Standard Schema + Standard JSON Schema (Zod ≥ 4.2,
// Valibot, ArkType). Structural: strata depends on none of them.
export type GrammarSchema = {
  '~standard': {
    validate: (value: unknown) => StandardResult | Promise<StandardResult>;
    jsonSchema: { input: (options: { target: string }) => Record<string, unknown> };
  };
};

export type Snapshot = { sequence: string; version: number; kinds: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const byKey = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : a > b ? 1 : 0);

// Sorted keys, nothing else — for documents, where every key (a `description`
// too) is content, and for a snapshot file, which keeps what the validator wrote.
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(byKey).map(([k, v]) => [k, sortKeys(v)]));
};

// Where a schema's keys are NAMES, not keywords — a field called `description`
// or an op called `$ref` is grammar — and where its values are instance data
// rather than schemas.
const NAMED = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const DATA = new Set(['const', 'enum', 'default', 'examples']);

// A schema without its prose: the `description` KEYWORD is documentation, and
// rewording a `.describe()` must not demand a migration. `$schema` is the same
// everywhere. Applied when comparing, never to what is recorded — so what the
// gate ignores can change without touching a snapshot file.
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description' && key !== '$schema')
      .sort(byKey)
      .map(([key, v]) => [key, NAMED.has(key) && isRecord(v) ? namedSchemas(v, normalize) : DATA.has(key) ? sortKeys(v) : normalize(v)]),
  );
};

// A name → schema map, each schema through `each`, the names untouched.
const namedSchemas = (map: Record<string, unknown>, each: (schema: unknown) => unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries(map).sort(byKey).map(([name, schema]) => [name, each(schema)]));

// The grammar as it stands: every kind it declares, as JSON Schema — as the
// validator wrote it, keys sorted. `schemas` must cover exactly the sequence's
// kinds — a kind without a schema cannot be checked, and a schema without a
// kind belongs to some other grammar.
export const snapshotOf = (sequence: Sequence, schemas: Readonly<Record<string, GrammarSchema>>): Snapshot => {
  const declared = Object.keys(sequence.documents ?? {}).map((k) => `${sequence.id}/${k}`);
  const given = Object.keys(schemas);
  const missing = declared.filter((k) => !given.includes(k));
  const extra = given.filter((k) => !declared.includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new StrataError('UNKNOWN_KIND', `The schemas for ${sequence.id} do not match its kinds.`, [
      ...missing.map((k) => `no schema for ${k}`),
      ...extra.map((k) => `${k} is not a kind of ${sequence.id}`),
    ]);
  }
  const kinds: Record<string, unknown> = {};
  for (const kind of [...declared].sort()) {
    const schema = schemas[kind];
    if (schema !== undefined) kinds[kind] = sortKeys(schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }));
  }
  return { sequence: sequence.id, version: sequence.migrations.length, kinds };
};

// Stable text for a snapshot file: sorted keys, two-space indent, newline.
export const snapshotText = (snapshot: Snapshot): string => `${JSON.stringify(sortKeys(snapshot), null, 2)}
`;

// Schema arrays are compared as sets (`sets`) — all but a tuple's `prefixItems`,
// see `diffPositions`; a document's arrays by position — `layout.children[1]` is
// how a person finds the thing that changed.
const diffLines = (a: unknown, b: unknown, path: string, out: string[], limit: number, canon: (v: unknown) => unknown = normalize, sets = true): void => {
  if (out.length >= limit) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (isRecord(a) && isRecord(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const at = path === '' ? key : `${path}.${key}`;
      const before = a[key];
      const after = b[key];
      if (!(key in a)) out.push(`+ ${at}`);
      else if (!(key in b)) out.push(`- ${at}`);
      else if (sets && key === 'prefixItems' && Array.isArray(before) && Array.isArray(after)) diffPositions(before, after, at, out, limit, canon);
      else diffLines(before, after, at, out, limit, canon, sets);
      if (out.length >= limit) return;
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && !sets && a.length === b.length) {
    a.forEach((item, i) => diffLines(item, b[i], `${path}[${i}]`, out, limit, canon, sets));
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Schema arrays are SETS more often than sequences — a union's `anyOf`, a
    // `required` list, an `enum` — and one added branch shifts every index
    // after it. Match elements by what they describe (an object schema by its
    // property names — for Prism's union, the op), report the ones on one side
    // only, and diff the ones that changed in place.
    const text = (v: unknown): string => JSON.stringify(canon(v));
    const label = (v: unknown): string =>
      isRecord(v) && isRecord(v['properties']) ? Object.keys(v['properties']).join(',') : (text(v) ?? '').slice(0, 50);
    const onlyA = a.filter((x) => !b.some((y) => text(y) === text(x)));
    const onlyB = b.filter((y) => !a.some((x) => text(x) === text(y)));
    const byLabel = new Map(onlyB.map((y) => [label(y), y]));
    for (const x of onlyA) {
      const partner = byLabel.get(label(x));
      if (partner !== undefined) {
        diffLines(x, partner, `${path}[${label(x)}]`, out, limit, canon, sets);
        byLabel.delete(label(x));
      } else {
        out.push(`- ${path}[${label(x)}]`);
      }
      if (out.length >= limit) return;
    }
    for (const [name] of byLabel) {
      out.push(`+ ${path}[${name}]`);
      if (out.length >= limit) return;
    }
    return;
  }
  out.push(`~ ${path || '(root)'}: ${JSON.stringify(a)?.slice(0, 60)} → ${JSON.stringify(b)?.slice(0, 60)}`);
};

// A tuple's `prefixItems` is the one schema array that is a SEQUENCE: position
// is the grammar, so [string, number] and [number, string] are different tuples
// and a document valid for one is not for the other. Compared place by place;
// what sits IN a place is a schema again, its own arrays sets as ever.
const diffPositions = (a: readonly unknown[], b: readonly unknown[], path: string, out: string[], limit: number, canon: (v: unknown) => unknown): void => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (out.length >= limit) return;
    if (i >= a.length) out.push(`+ ${path}[${i}]`);
    else if (i >= b.length) out.push(`- ${path}[${i}]`);
    else diffLines(a[i], b[i], `${path}[${i}]`, out, limit, canon, true);
  }
};

// ── canonical form ──────────────────────────────────────────────
//
// A snapshot records what the validator WROTE, and validators spell one schema
// many ways: they name and inline definitions as they please (zod numbers them
// in visit order, and 4.3 and 4.4 visit differently), write a described
// reference as `allOf: [{ $ref }]` or as `$ref`, and a union of bare types as
// `anyOf: [{ type }, …]` or `type: […]`. None of that is the grammar, so a
// comparison reads both sides in one spelling: every definition inlined unless
// it is recursive, the recursive ones renamed by first use, and every schema
// identity above written one way. A snapshot FILE stays what the validator
// wrote — only the comparison is canonical.

const REF_PREFIX = /^#\/(\$defs|definitions)\//;

// One spelling for the equivalences the node itself can show.
const respell = (value: Record<string, unknown>): Record<string, unknown> => {
  let node = value;
  const anyOf = node['anyOf'];
  if (!('type' in node) && Array.isArray(anyOf) && anyOf.length > 0 && anyOf.every((m) => isRecord(m) && Object.keys(m).length === 1 && typeof m['type'] === 'string')) {
    const { anyOf: _union, ...rest } = node;
    node = { ...rest, type: anyOf.map((m) => (isRecord(m) ? m['type'] : undefined)) };
  }
  const type = node['type'];
  if (Array.isArray(type)) {
    const types = [...new Set(type.map(String))].sort();
    node = { ...node, type: types.length === 1 ? types[0] : types };
  }
  const allOf = node['allOf'];
  const only: unknown = Array.isArray(allOf) && allOf.length === 1 ? allOf[0] : undefined;
  if (!('$ref' in node) && isRecord(only) && Object.keys(only).length === 1 && typeof only['$ref'] === 'string') {
    const { allOf: _wrapper, ...rest } = node;
    node = { ...rest, $ref: only['$ref'] };
  }
  return node;
};

// A schema node's own children — keyword values, and each schema of a name
// map — but never the names, and never instance data.
const schemaChildren = (node: Record<string, unknown>): unknown[] =>
  Object.entries(node).flatMap(([key, child]) =>
    key === '$ref' || DATA.has(key) ? [] : NAMED.has(key) && isRecord(child) ? Object.values(child) : [child],
  );

const canonical = (recorded: unknown): unknown => {
  const schema = normalize(recorded);
  if (!isRecord(schema)) return schema;
  const defs: Record<string, unknown> = {
    ...(isRecord(schema['definitions']) ? schema['definitions'] : {}),
    ...(isRecord(schema['$defs']) ? schema['$defs'] : {}),
  };
  const { $defs: _defs, definitions: _definitions, ...body } = schema;
  const target = (ref: string): { key: string; node: unknown } =>
    ref === '#' ? { key: '#', node: body } : { key: ref, node: defs[ref.replace(REF_PREFIX, '')] };

  // Which targets are reached from inside their own expansion: those, and
  // only those, stay definitions.
  const recursive = new Set<string>();
  const findCycles = (value: unknown, stack: readonly string[]): void => {
    if (Array.isArray(value)) {
      for (const item of value) findCycles(item, stack);
      return;
    }
    if (!isRecord(value)) return;
    const node = respell(value);
    for (const child of schemaChildren(node)) findCycles(child, stack);
    const ref = node['$ref'];
    if (typeof ref !== 'string') return;
    const { key, node: next } = target(ref);
    if (stack.includes(key)) recursive.add(key);
    else findCycles(next, [...stack, key]);
  };
  findCycles(body, ['#']);

  const names = new Map<string, string>();
  const named: Record<string, unknown> = {};
  const nameOf = (key: string, node: unknown): string => {
    const known = names.get(key);
    if (known !== undefined) return known;
    const name = `d${names.size}`;
    names.set(key, name);
    named[name] = emit(node);
    return name;
  };
  const emit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(emit);
    if (!isRecord(value)) return value;
    const node = respell(value);
    const rest: Record<string, unknown> = Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== '$ref')
        .sort(byKey)
        .map(([key, child]) => [key, NAMED.has(key) && isRecord(child) ? namedSchemas(child, emit) : DATA.has(key) ? child : emit(child)]),
    );
    const ref = node['$ref'];
    if (typeof ref !== 'string') return rest;
    const { key, node: next } = target(ref);
    const referred = recursive.has(key) ? { $ref: `#/$defs/${nameOf(key, next)}` } : emit(next);
    return Object.keys(rest).length > 0 ? { ...rest, allOf: [referred] } : referred;
  };

  const root = recursive.has('#') ? { $ref: `#/$defs/${nameOf('#', body)}` } : emit(body);
  return Object.keys(named).length === 0 ? root : sortKeys({ ...(isRecord(root) ? root : { allOf: [root] }), $defs: named });
};

export type SnapshotComparison =
  | { status: 'same' }
  | { status: 'missing' }
  | { status: 'changed'; changes: readonly { kind: string; lines: readonly string[] }[] };

// `recorded` is the snapshot kept for the grammar's CURRENT version (or
// undefined if none was kept). Changed means: a migration is owed. Both sides
// are read in canonical form, so a validator's respelling is not a change.
export const compareSnapshot = (recorded: Snapshot | undefined, current: Snapshot): SnapshotComparison => {
  if (recorded === undefined) return { status: 'missing' };
  const changes: { kind: string; lines: string[] }[] = [];
  for (const kind of [...new Set([...Object.keys(recorded.kinds), ...Object.keys(current.kinds)])].sort()) {
    const lines: string[] = [];
    if (!(kind in recorded.kinds)) lines.push('+ (a new kind)');
    else if (!(kind in current.kinds)) lines.push('- (the kind is gone)');
    else diffLines(canonical(recorded.kinds[kind]), canonical(current.kinds[kind]), '', lines, 12);
    if (lines.length > 0) changes.push({ kind, lines });
  }
  return changes.length === 0 ? { status: 'same' } : { status: 'changed', changes };
};

// ── the corpus ──────────────────────────────────────────────────

export type CorpusDocument = { id: string; kind: string; stamp: Stamp; document: unknown };
export type CorpusFailure = { id: string; kind: string; reason: string };
export type CorpusReport = { passed: number; failures: readonly CorpusFailure[] };

const issueText = (issue: Issue): string => {
  const path = (issue.path ?? []).map((p) => (typeof p === 'object' ? String(p.key) : String(p))).join('.');
  return `${path === '' ? '' : `${path}: `}${issue.message}`;
};

// What differs between two JSON values, as short lines (`+ a.b`, `- c`,
// `~ d: 1 → 2`) — for a report a person or an agent acts on.
export const diffJson = (a: unknown, b: unknown, limit = 20): string[] => {
  const out: string[] = [];
  diffLines(a, b, '', out, limit, sortKeys, false);
  return out;
};

// Every document, upgraded from its stamp, must pass the current schema of its kind.
export const checkCorpus = async (
  upgrader: Upgrader,
  schemas: Readonly<Record<string, GrammarSchema>>,
  documents: readonly CorpusDocument[],
): Promise<CorpusReport> => {
  const failures: CorpusFailure[] = [];
  let passed = 0;
  for (const doc of documents) {
    const schema = schemas[doc.kind];
    if (schema === undefined) {
      failures.push({ id: doc.id, kind: doc.kind, reason: `no schema for ${doc.kind}` });
      continue;
    }
    let upgraded: unknown;
    try {
      upgraded = upgrader.upgrade(doc.document, { kind: doc.kind, stamp: doc.stamp }).document;
    } catch (error) {
      failures.push({ id: doc.id, kind: doc.kind, reason: error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error) });
      continue;
    }
    const result = await schema['~standard'].validate(upgraded);
    if (result.issues !== undefined) {
      failures.push({ id: doc.id, kind: doc.kind, reason: result.issues.slice(0, 3).map(issueText).join('; ') });
    } else {
      passed += 1;
    }
  }
  return { passed, failures };
};
