import { z } from 'zod';

export type ValueKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export type SchemaInfo = {
  acceptedKinds: ReadonlySet<ValueKind> | 'any';
  subSchema: z.ZodType | null;
};

const ANY_INFO: SchemaInfo = { acceptedKinds: 'any', subSchema: null };

export const walkSchema = (root: z.ZodType, segments: readonly string[]): SchemaInfo | null => {
  let current: z.ZodType | null = root;
  for (const segment of segments) {
    if (!current) return null;
    current = stepInto(current, segment);
  }
  if (!current) return null;
  return inspectSchema(current);
};

const stepInto = (schema: z.ZodType, segment: string): z.ZodType | null => {
  const s = unwrap(schema);

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

  if (s instanceof z.ZodUnion) {
    const options = (s._zod.def.options ?? []) as z.ZodType[];
    for (const opt of options) {
      const next = stepInto(opt, segment);
      if (next) return next;
    }
    return null;
  }

  if (isDiscriminatedUnion(s)) {
    const options = getDiscriminatedUnionOptions(s);
    for (const opt of options) {
      const next = stepInto(opt, segment);
      if (next) return next;
    }
    return null;
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

  if (s instanceof z.ZodString) return { acceptedKinds: withNull(new Set(['string'])), subSchema: schema };
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

const getDiscriminatedUnionOptions = (schema: z.ZodType): z.ZodType[] =>
  ((schema as DiscriminatedUnionLike)._zod.def.options ?? []) as z.ZodType[];

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
