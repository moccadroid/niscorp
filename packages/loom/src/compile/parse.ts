import type { ZodType } from 'zod';
import type {
  CompileOptions,
  EmptyValue,
  EnumOption,
  Field,
  FieldKind,
  FieldMeta,
  ObjectField,
  Pattern,
  Variant,
} from './types.js';

type ZodDef = {
  type: string;
  innerType?: ZodType;
  element?: ZodType;
  shape?: Record<string, ZodType>;
  entries?: Record<string, unknown>;
  defaultValue?: unknown;
  format?: string;
  checks?: ReadonlyArray<{ def?: { format?: string } }>;
  discriminator?: string;
  options?: readonly ZodType[];
  items?: readonly ZodType[];
  values?: readonly unknown[];
  getter?: () => ZodType;
};

const defOf = (schema: ZodType): ZodDef => schema.def as ZodDef;

// Keyed by def, not by instance: `.describe()` and `.meta()` clone the wrapper
// but share the def, and an alias of a recursive schema has to be recognized as
// the schema itself.
type Walk = { stack: Set<ZodDef>; targets: Set<ZodDef> };

const INTEGER_FORMAT = 'safeint';

const stringFormat = (schema: ZodType): string | undefined => {
  const def = defOf(schema);
  if (def.format !== undefined) return def.format;
  for (const check of def.checks ?? []) {
    if (check.def?.format !== undefined) return check.def.format;
  }
  return undefined;
};

const isInteger = (schema: ZodType): boolean => {
  const def = defOf(schema);
  if (def.format === INTEGER_FORMAT) return true;
  return (def.checks ?? []).some((check) => check.def?.format === INTEGER_FORMAT);
};

const enumOptions = (schema: ZodType): EnumOption[] =>
  Object.values(defOf(schema).entries ?? {}).map((value) => ({ value, label: String(value) }));

const objectFields = (schema: ZodType, walk: Walk): ObjectField[] =>
  Object.entries(defOf(schema).shape ?? {}).map(([key, value]) => ({
    key,
    required: !value.safeParse(undefined).success,
    field: parseField(value, walk),
  }));

const branchKeys = (branch: ZodType): string[] => Object.keys(defOf(branch).shape ?? {});

const JSON_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const jsonType = (branch: ZodType): string | undefined => {
  const type = defOf(branch).type;
  return JSON_TYPES.has(type) ? type : undefined;
};

const distinguish = (branch: ZodType, siblings: readonly ZodType[], tag: string | undefined): Pattern | undefined => {
  if (tag !== undefined) {
    const literal = (defOf(branch).shape ?? {})[tag];
    return { kind: 'tag', key: tag, value: literal !== undefined ? defOf(literal).values?.[0] : undefined };
  }
  const elsewhere = new Set(siblings.flatMap(branchKeys));
  const key = branchKeys(branch).find((k) => !elsewhere.has(k));
  if (key !== undefined) return { kind: 'key', key };
  const type = jsonType(branch);
  if (type !== undefined && siblings.every((s) => jsonType(s) !== type)) return { kind: 'type', type };
  return undefined;
};

const patternLabel = (pattern: Pattern): string =>
  pattern.kind === 'tag'
    ? String(pattern.value)
    : pattern.kind === 'key'
      ? pattern.key
      : pattern.kind === 'type'
        ? pattern.type
        : 'other';

const flattenBranches = (branches: readonly ZodType[], seen: Set<ZodDef> = new Set()): ZodType[] =>
  branches.flatMap((branch) => {
    const { core } = unwrap(branch);
    const def = defOf(core);
    if (def.type !== 'union' || seen.has(def)) return [branch];
    return flattenBranches(def.options ?? [], new Set(seen).add(def));
  });

const branchField = (branch: ZodType, walk: Walk, tag: string | undefined): Field =>
  tag === undefined
    ? parseField(branch, walk)
    : { kind: 'object', fields: objectFields(branch, walk).filter((f) => f.key !== tag) };

const parseByType: Record<string, (schema: ZodType, walk: Walk) => Field> = {
  string: (schema) => {
    const format = stringFormat(schema);
    return format !== undefined ? { kind: 'string', format } : { kind: 'string' };
  },
  number: (schema) => (isInteger(schema) ? { kind: 'number', integer: true } : { kind: 'number' }),
  boolean: () => ({ kind: 'boolean' }),
  enum: (schema) => ({ kind: 'enum', options: enumOptions(schema) }),
  object: (schema, walk) => {
    const def = defOf(schema);
    walk.stack.add(def);
    const fields = objectFields(schema, walk);
    walk.stack.delete(def);
    return walk.targets.has(def) ? { kind: 'object', fields, recursive: true } : { kind: 'object', fields };
  },
  array: (schema, walk) => {
    const element = defOf(schema).element;
    return { kind: 'array', item: element !== undefined ? parseField(element, walk) : { kind: 'unknown' } };
  },
  tuple: (schema, walk) => ({ kind: 'tuple', items: (defOf(schema).items ?? []).map((item) => parseField(item, walk)) }),
  union: (schema, walk) => {
    // Deduplicated by identity: a union that nests back into itself yields the
    // same member instances twice.
    const branches = [...new Set(flattenBranches(defOf(schema).options ?? []))];
    const tag = defOf(schema).discriminator;
    const patterns = branches.map((b) => distinguish(b, branches.filter((x) => x !== b), tag));
    const open = patterns.reduce<number[]>((acc, p, i) => (p === undefined ? [...acc, i] : acc), []);
    if (branches.length === 0 || open.length > 1) return { kind: 'unknown' };
    if (open.length === 1) patterns[open[0]!] = { kind: 'fallback' };
    const def = defOf(schema);
    walk.stack.add(def);
    const variants: Variant[] = branches.map((branch, i) => ({
      label: readMeta(branch).title ?? patternLabel(patterns[i]!),
      field: branchField(branch, walk, tag),
      pattern: patterns[i]!,
    }));
    walk.stack.delete(def);
    return walk.targets.has(def) ? { kind: 'union', variants, recursive: true } : { kind: 'union', variants };
  },
};

const unknownField = (): Field => ({ kind: 'unknown' });

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly']);

// A lazy's getter may build a fresh instance on every call
// (`z.lazy(() => z.union([...]))`). Cycle detection needs the same instance each
// time, so each lazy is resolved once.
const lazyResolved = new WeakMap<ZodDef, ZodType>();
const resolveLazy = (lazy: ZodType): ZodType | undefined => {
  const def = defOf(lazy);
  const cached = lazyResolved.get(def);
  if (cached !== undefined) return cached;
  const resolved = def.getter?.();
  if (resolved !== undefined) lazyResolved.set(def, resolved);
  return resolved;
};

const unwrap = (schema: ZodType): { core: ZodType; default?: unknown } => {
  let core = schema;
  let fallback: unknown;
  let def = defOf(core);
  while (WRAPPERS.has(def.type) || def.type === 'lazy') {
    const inner = def.type === 'lazy' ? resolveLazy(core) : def.innerType;
    if (inner === undefined) break;
    if ('defaultValue' in def) fallback = def.defaultValue;
    core = inner;
    def = defOf(core);
  }
  return fallback !== undefined ? { core, default: fallback } : { core };
};

const readMeta = (schema: ZodType): FieldMeta => {
  const meta: FieldMeta = {};
  const title = (schema.meta() as { title?: unknown } | undefined)?.title;
  if (typeof title === 'string') meta.title = title;
  if (schema.description !== undefined) meta.description = schema.description;
  return meta;
};

const parseField = (schema: ZodType, walk: Walk): Field => {
  const { core, default: fallback } = unwrap(schema);
  if (walk.stack.has(defOf(core))) {
    walk.targets.add(defOf(core));
    return { kind: 'self' };
  }
  const body = (parseByType[defOf(core).type] ?? unknownField)(core, walk);
  const meta = { ...readMeta(core), ...readMeta(schema) };
  return { ...body, ...meta, ...(fallback !== undefined ? { default: fallback } : {}) };
};

export const parse = (schema: ZodType): Field =>
  parseField(schema, { stack: new Set(), targets: new Set() });

const EMPTY: Record<FieldKind, EmptyValue> = {
  string: () => '',
  number: () => 0,
  boolean: () => false,
  // `undefined`, not `null`: an optional enum accepts absence and a required one
  // reports it, while a Zod enum rejects `null` outright.
  enum: () => undefined,
  array: () => [],
  tuple: (field, options) => (field.kind === 'tuple' ? field.items.map((item) => buildDocument(item, options)) : []),
  self: () => undefined,
  unknown: () => null,
  object: (field, options) => {
    if (field.kind !== 'object') return {};
    const includeOptional = options.includeOptional ?? true;
    const document: Record<string, unknown> = {};
    for (const child of field.fields) {
      if (!child.required && !includeOptional) continue;
      const value = buildDocument(child.field, options);
      if (value !== undefined) document[child.key] = value;
    }
    return document;
  },
  union: (field) => {
    if (field.kind !== 'union') return {};
    const first = field.variants[0];
    return first === undefined ? {} : variantDefaults(first);
  },
};

export const buildDocument = (field: Field, options: CompileOptions): unknown => {
  if (field.default !== undefined) return field.default;
  return (options.empty?.[field.kind] ?? EMPTY[field.kind])(field, options);
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const variantDefaults = (variant: Variant): unknown => {
  const defaults = buildDocument(variant.field, {});
  if (variant.pattern.kind !== 'tag') return defaults;
  return { [variant.pattern.key]: variant.pattern.value, ...(isRecord(defaults) ? defaults : {}) };
};
