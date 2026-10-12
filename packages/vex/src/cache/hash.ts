import type { DatabaseSchema } from '../schemas/database.schema.js';
import { hashText } from '../utils/canonical.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const normalizeShape = (shape: unknown): unknown => {
  if (shape === null) return 'null';
  if (shape === undefined) return 'unknown';

  if (Array.isArray(shape)) {
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

  return 'unknown';
};

export const mintFingerprint = (): string =>
  `fp_${hashText(`${Date.now()}:${Math.random()}`).slice(0, 16)}`;

// Context values stay out (runtime data, possibly sensitive); only the key names take part.
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
  return hashText(JSON.stringify(identity));
};

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
  policy === undefined ? 'none' : hashText(JSON.stringify(canonical(policy))).slice(0, 16);

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
      // Column order within a relation is the key's own order, so it is not sorted.
      relations: [...e.relations]
        .sort((a, b) => `${a.entity}.${a.localFields.join(',')}`.localeCompare(`${b.entity}.${b.localFields.join(',')}`))
        .map((r) => ({ type: r.type, entity: r.entity, localFields: r.localFields, foreignFields: r.foreignFields })),
      // Index field order is significant (composite indexes) and stable from introspection.
      indexes: [...e.indexes].sort(byName).map((i) => ({
        name: i.name,
        fields: i.fields,
        unique: i.unique,
        type: i.type,
      })),
    })),
  };

  return hashText(JSON.stringify(stable));
};
