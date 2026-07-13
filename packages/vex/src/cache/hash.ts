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
      relations: [...e.relations]
        .sort((a, b) => `${a.entity}.${a.localField}`.localeCompare(`${b.entity}.${b.localField}`))
        .map((r) => ({ type: r.type, entity: r.entity, localField: r.localField, foreignField: r.foreignField })),
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
