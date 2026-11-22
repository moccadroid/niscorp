import { z } from 'zod';

export type ValueKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export type SchemaInfo = {
  acceptedKinds: ReadonlySet<ValueKind> | 'any';
  subSchema: z.ZodType | null;
  alternatives?: readonly z.ZodType[];
};

const ANY_INFO: SchemaInfo = { acceptedKinds: 'any', subSchema: null };

export const walkSchema = (root: z.ZodType, segments: readonly string[]): SchemaInfo | null => {
  let current: readonly z.ZodType[] = [root];
  for (const segment of segments) {
    const next = current.flatMap((schema) => stepInto(schema, segment));
    if (next.length === 0) {
      // Below a schema that takes any value, every value is taken.
      return current.some((schema) => inspectSchema(enter(schema)).acceptedKinds === 'any') ? ANY_INFO : null;
    }
    current = next;
  }
  const [first, ...others] = current;
  if (first === undefined) return null;
  if (others.length === 0) return inspectSchema(first);
  const kinds = new Set<ValueKind>();
  for (const info of current.map(inspectSchema)) {
    if (info.acceptedKinds === 'any') return { acceptedKinds: 'any', subSchema: first, alternatives: current };
    for (const kind of info.acceptedKinds) kinds.add(kind);
  }
  return { acceptedKinds: kinds, subSchema: first, alternatives: current };
};

// What streamed JSON is read against: a lazy schema's own schema, a pipe's input side.
const enter = (schema: z.ZodType): z.ZodType => {
  let s = unwrap(schema);
  for (let i = 0; i < 32; i++) {
    if (s instanceof z.ZodLazy) s = unwrap(s.unwrap() as z.ZodType);
    else if (s instanceof z.ZodPipe) s = unwrap(s._zod.def.in as z.ZodType);
    else return s;
  }
  return s;
};

// Into every variant of a union that has the segment.
const stepInto = (schema: z.ZodType, segment: string): z.ZodType[] => {
  const s = enter(schema);
  if (s instanceof z.ZodUnion) {
    const options = (s._zod.def.options ?? []) as z.ZodType[];
    return options.flatMap((option) => stepInto(option, segment));
  }
  const next = stepIntoMember(s, segment);
  return next ? [next] : [];
};

const stepIntoMember = (s: z.ZodType, segment: string): z.ZodType | null => {
  if (s instanceof z.ZodObject) {
    const shape = s.shape as Record<string, z.ZodType>;
    return shape[segment] ?? null;
  }

  if (s instanceof z.ZodArray) {
    return s.element as z.ZodType;
  }

  if (s instanceof z.ZodTuple) {
    const items = (s._zod.def.items ?? []) as z.ZodType[];
    const idx = Number(segment);
    if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
      return items[idx] ?? null;
    }
    const rest = (s._zod.def.rest as z.ZodType | undefined) ?? null;
    return rest;
  }

  if (s instanceof z.ZodRecord) {
    return (s._zod.def.valueType as z.ZodType | undefined) ?? null;
  }

  return null;
};

export const inspectSchema = (schema: z.ZodType): SchemaInfo => {
  const nullable = allowsNull(schema);
  const s = unwrap(schema);

  const withNull = (kinds: Set<ValueKind>): ReadonlySet<ValueKind> => {
    if (nullable) kinds.add('null');
    return kinds;
  };

  // z.email(), z.uuid(), z.iso.date() and the other formats are strings, not ZodString instances.
  if (s instanceof z.ZodString || s._zod.def.type === 'string') return { acceptedKinds: withNull(new Set(['string'])), subSchema: schema };
  if (s instanceof z.ZodNumber) return { acceptedKinds: withNull(new Set(['number'])), subSchema: schema };
  if (s instanceof z.ZodBoolean) return { acceptedKinds: withNull(new Set(['boolean'])), subSchema: schema };
  if (s instanceof z.ZodNull) return { acceptedKinds: new Set(['null']), subSchema: schema };
  if (s instanceof z.ZodObject) return { acceptedKinds: withNull(new Set(['object'])), subSchema: schema };
  if (s instanceof z.ZodArray) return { acceptedKinds: withNull(new Set(['array'])), subSchema: schema };
  if (s instanceof z.ZodTuple) return { acceptedKinds: withNull(new Set(['array'])), subSchema: schema };
  if (s instanceof z.ZodRecord) return { acceptedKinds: withNull(new Set(['object'])), subSchema: schema };

  if (s instanceof z.ZodEnum) {
    return { acceptedKinds: withNull(new Set(['string'])), subSchema: schema };
  }

  if (s instanceof z.ZodLiteral) {
    const values = [...((s._zod.def.values ?? []) as unknown[])];
    const kinds = new Set<ValueKind>();
    for (const v of values) kinds.add(literalToKind(v));
    return { acceptedKinds: withNull(kinds), subSchema: schema };
  }

  if (s instanceof z.ZodUnion) {
    const options = (s._zod.def.options ?? []) as z.ZodType[];
    const kinds = new Set<ValueKind>();
    for (const opt of options) {
      const info = inspectSchema(opt);
      if (info.acceptedKinds === 'any') return { acceptedKinds: 'any', subSchema: schema };
      for (const k of info.acceptedKinds) kinds.add(k);
    }
    return { acceptedKinds: withNull(kinds), subSchema: schema };
  }

  if (isDiscriminatedUnion(s)) {
    return { acceptedKinds: withNull(new Set(['object'])), subSchema: schema };
  }

  return { acceptedKinds: 'any', subSchema: schema };
};

const unwrap = (schema: z.ZodType): z.ZodType => {
  let s: z.ZodType = schema;
  for (let i = 0; i < 32; i++) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
      s = (s as z.ZodOptional<z.ZodType>).unwrap() as z.ZodType;
      continue;
    }
    if (s instanceof z.ZodDefault) {
      s = (s._zod.def.innerType as z.ZodType);
      continue;
    }
    return s;
  }
  return s;
};

type DiscriminatedUnionLike = { _zod: { def: { type?: string; options?: unknown[] } } };

const isDiscriminatedUnion = (schema: z.ZodType): boolean => {
  const def = (schema as DiscriminatedUnionLike)._zod?.def;
  return def?.type === 'discriminatedUnion' || def?.type === 'discriminated_union';
};

const literalToKind = (v: unknown): ValueKind => {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'object': return Array.isArray(v) ? 'array' : 'object';
    default: return 'string';
  }
};

const allowsNull = (schema: z.ZodType): boolean => {
  let s: z.ZodType = schema;
  for (let i = 0; i < 32; i++) {
    if (s instanceof z.ZodNullable) return true;
    if (s instanceof z.ZodOptional) {
      s = s.unwrap() as z.ZodType;
      continue;
    }
    if (s instanceof z.ZodDefault) {
      s = s._zod.def.innerType as z.ZodType;
      continue;
    }
    return false;
  }
  return false;
};

export const allowsUndefined = (schema: z.ZodType): boolean => {
  let s: z.ZodType = schema;
  for (let i = 0; i < 32; i++) {
    if (s instanceof z.ZodOptional) return true;
    if (s instanceof z.ZodNullable) {
      s = s.unwrap() as z.ZodType;
      continue;
    }
    if (s instanceof z.ZodDefault) return true;
    return false;
  }
  return false;
};

const kindOf = (value: unknown): ValueKind => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' ? type : 'object';
};

// Every value in it is of a kind the schema takes at its place; a missing one is not looked at.
export const fitsKinds = (root: z.ZodType, value: unknown, segments: readonly string[] = []): boolean => {
  if (value === undefined) return true;
  const info = walkSchema(root, segments);
  if (!info) return false;
  if (info.acceptedKinds !== 'any' && !info.acceptedKinds.has(kindOf(value))) return false;
  if (typeof value !== 'object' || value === null) return true;
  return Object.entries(value).every(([key, child]) => fitsKinds(root, child, [...segments, key]));
};
