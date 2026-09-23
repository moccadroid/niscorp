import { createHash } from 'node:crypto';
import type { DatabaseSchema } from '../schemas/database.schema.js';

// ───────────────────────────────────────────────────────────────
// Shape normalization
// ───────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const normalizeShape = (shape: unknown): unknown => {
  if (shape === null) return 'null';
  if (shape === undefined) return 'unknown';

  if (Array.isArray(shape)) {
    // Collapse to first-element shape (all elements assumed same shape)
    const first: unknown = shape[0];
    return first !== undefined ? [normalizeShape(first)] : [];
  }

  if (isRecord(shape)) {
    const sortedKeys = Object.keys(shape).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalized[key] = normalizeShape(shape[key]);
    }
    return normalized;
  }

  if (typeof shape === 'string') return 'string';
  if (typeof shape === 'number') return 'number';
  if (typeof shape === 'boolean') return 'boolean';

  // functions, symbols, bigint, etc.
  return 'unknown';
};

// ───────────────────────────────────────────────────────────────
// Fingerprints
//
// The ONE cache identity. Minted (`fp_…`) when a request arrives
// without one — an immutable pin the caller can embed and replay.
// Caller-chosen strings are mutable named slots. Shape hashes are no
// longer keys anywhere; normalizeShape survives only inside
// computeRequestHash (request-identity comparison).
// ───────────────────────────────────────────────────────────────

export const mintFingerprint = (): string =>
  `fp_${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16)}`;

// ───────────────────────────────────────────────────────────────
// Schema fingerprint
//
// A hash of the *structural* (DDL) shape of the database schema, stored
// on each cache entry so a cached DSL — which references concrete
// columns — can be invalidated when the schema changes out from under it
// (a dropped/renamed column would otherwise compile to broken SQL on a
// cache hit).
//
// Critically, this must be STABLE across restarts for an unchanged
// schema, or warm-up entries would be wrongly judged stale and thrown
// away on first read. So we project to a canonical, sorted form and
// deliberately exclude volatile data: rowCount (a drifting pg estimate)
// and cosmetic fields (description, defaultValue). A row-count change is
// not a schema change — the cached SQL is still valid.
// ───────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────
// Request identity hash
//
// Unlike the shape hash (which keys the positive cache and intentionally
// ignores intent), this identifies the *whole request*: intent + shape
// class + the set of context keys. It keys things where intent matters —
// the negative cache (whether a request is satisfiable depends on the
// intent, not just the output shape) and single-flight de-duplication of
// concurrent identical misses. Context *values* are excluded (runtime
// data, potentially sensitive); only the key names participate.
// ───────────────────────────────────────────────────────────────

export const computeRequestHash = (request: {
  intent?: string;
  shape?: unknown;
  context?: Record<string, unknown>;
}): string => {
  const identity = {
    intent: request.intent ?? null,
    shape: normalizeShape(request.shape),
    contextKeys: Object.keys(request.context ?? {}).sort(),
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
};

// Which POLICY a generation ran under — part of the single-flight and
// negative-cache keys, because an agent that can see different tables is a
// different agent. Key order is normalised so two structurally equal policies
// built in different orders share a key. `none` is the engine with no policy.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
};

export const computePolicyKey = (policy: unknown): string =>
  policy === undefined ? 'none' : createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex').slice(0, 16);

export const computeSchemaFingerprint = (schema: DatabaseSchema): string => {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  const stable = {
    entities: [...schema.entities].sort(byName).map((e) => ({
      name: e.name,
      table: e.table,
      fields: [...e.fields].sort(byName).map((f) => ({
        name: f.name,
        type: f.type,
        normalizedType: f.normalizedType,
        nullable: f.nullable,
        primaryKey: f.primaryKey,
        ...(f.vectorDimensions !== undefined ? { vectorDimensions: f.vectorDimensions } : {}),
      })),
      // Column order within a relation is the key's own order, so it is
      // preserved; relations are sorted by target and columns. This shape
      // changed when keys became composite, so every entry cached before
      // revalidates once on the next boot — the drift eviction, by design.
      relations: [...e.relations]
        .sort((a, b) => `${a.entity}.${a.localFields.join(',')}`.localeCompare(`${b.entity}.${b.localFields.join(',')}`))
        .map((r) => ({ type: r.type, entity: r.entity, localFields: r.localFields, foreignFields: r.foreignFields })),
      // Index field order is significant (composite indexes) and stable
      // from introspection, so it is preserved; indexes are sorted by name.
      indexes: [...e.indexes].sort(byName).map((i) => ({
        name: i.name,
        fields: i.fields,
        unique: i.unique,
        type: i.type,
      })),
    })),
  };

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
};
