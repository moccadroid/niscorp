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

// Sorted keys and no prose: `description` is documentation, and rewording a
// `.describe()` must not demand a migration. `$schema` is the same everywhere.
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description' && key !== '$schema')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => [key, normalize(v)]),
  );
};

// The grammar as it stands: every kind it declares, as JSON Schema. `schemas`
// must cover exactly the sequence's kinds — a kind without a schema cannot be
// checked, and a schema without a kind belongs to some other grammar.
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
    if (schema !== undefined) kinds[kind] = normalize(schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }));
  }
  return { sequence: sequence.id, version: sequence.migrations.length, kinds };
};

// Stable text for a snapshot file: sorted keys, two-space indent, newline.
export const snapshotText = (snapshot: Snapshot): string => `${JSON.stringify(normalize(snapshot), null, 2)}\n`;

// What differs between two JSON values, as short lines a person can act on.
// Sorted keys only — for documents, where every key (a `description` too) is content.
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]));
};

// Schema arrays are compared as sets (`sets`); a document's arrays by position —
// `layout.children[1]` is how a person finds the thing that changed.
const diffLines = (a: unknown, b: unknown, path: string, out: string[], limit: number, canon: (v: unknown) => unknown = normalize, sets = true): void => {
  if (out.length >= limit) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (isRecord(a) && isRecord(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const at = path === '' ? key : `${path}.${key}`;
      if (!(key in a)) out.push(`+ ${at}`);
      else if (!(key in b)) out.push(`- ${at}`);
      else diffLines(a[key], b[key], at, out, limit, canon, sets);
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

export type SnapshotComparison =
  | { status: 'same' }
  | { status: 'missing' }
  | { status: 'changed'; changes: readonly { kind: string; lines: readonly string[] }[] };

// `recorded` is the snapshot kept for the grammar's CURRENT version (or
// undefined if none was kept). Changed means: a migration is owed.
export const compareSnapshot = (recorded: Snapshot | undefined, current: Snapshot): SnapshotComparison => {
  if (recorded === undefined) return { status: 'missing' };
  const changes: { kind: string; lines: string[] }[] = [];
  for (const kind of [...new Set([...Object.keys(recorded.kinds), ...Object.keys(current.kinds)])].sort()) {
    const lines: string[] = [];
    if (!(kind in recorded.kinds)) lines.push('+ (a new kind)');
    else if (!(kind in current.kinds)) lines.push('- (the kind is gone)');
    else diffLines(normalize(recorded.kinds[kind]), normalize(current.kinds[kind]), '', lines, 12);
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
