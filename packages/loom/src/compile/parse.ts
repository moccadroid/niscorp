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

// parse — turn a Zod schema into Loom's field model (IR). The only Zod-aware
// code in the package, and pure data in / pure data out: no Nova. `parseByType`
// is keyed by Zod's own `def.type` tag, so the type vocabulary lives as table
// keys, not scattered checks.
//
// A recursive schema (`z.lazy`, or an object whose getter returns itself) would
// expand forever. The walk carries the set of schemas it is currently inside;
// re-entering one is a back-edge, emitted as a `self` marker and recorded so
// the object it points back to can be tagged `recursive`. Expansion stops at
// the cycle — the document, not the schema, decides how deep an editor goes.

// The slice of a Zod schema's internal definition that parsing reads.
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

// Zod types every schema's `.def` as the base `$ZodTypeDef` (just the `type`
// discriminant); the per-type fields we read live on the concrete defs. This
// views `.def` through the structural slice above — the single place the
// parser depends on Zod's internal shape.
const defOf = (schema: ZodType): ZodDef => schema.def as ZodDef;

// While walking, the schemas currently on the stack (cycle detection) and the
// schemas a `self` pointed back to (so the matching object is tagged recursive).
// Keyed by def, not instance: `.describe()`/`.meta()` clone the wrapper but
// share the def, so a described alias of a recursive schema must read as the
// schema itself — or every back-edge re-expands the whole thing one more level.
type Walk = { stack: Set<ZodDef>; targets: Set<ZodDef> };

// ─── Reading Zod ─────────────────────────────────────────────

// `safeint` is Zod's format tag for an integer-constrained number — the one
// Zod-vocabulary token this file matches on.
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
    // A property is optional when the schema accepts `undefined` for it
    // (covers `.optional()` and `.default()`) — asked of Zod, not inferred.
    required: !value.safeParse(undefined).success,
    field: parseField(value, walk),
  }));

// ─── Union discrimination ────────────────────────────────────
// For each branch, the cheapest fact that tells it apart from its siblings: the
// declared tag's value, else a key only it carries, else a JS type only it is.
// One function covers tagged, structural, and mixed unions; a branch that none
// of these distinguish makes the whole union fall back to the raw editor.

const branchKeys = (branch: ZodType): string[] => Object.keys(defOf(branch).shape ?? {});

// The branch's JS type, when it's one the runtime matcher checks (Zod names
// these the same as `typeof`/`Array.isArray` do); otherwise undefined.
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

// A union may nest unions (`z.union([...primitives, ...ops])` where the
// primitives are themselves a `z.union`). The branches of a nested union are
// siblings of the outer ones for discrimination, so inline them. Each branch is
// unwrapped first (a described/optional sub-union still flattens); a non-union
// branch passes through untouched. Unwrapping resolves lazies, so `seen` guards
// a union that nests back into itself: once a union core is being flattened,
// re-encountering it keeps the branch as a leaf rather than recursing forever.
const flattenBranches = (branches: readonly ZodType[], seen: Set<ZodDef> = new Set()): ZodType[] =>
  branches.flatMap((branch) => {
    const { core } = unwrap(branch);
    const def = defOf(core);
    if (def.type !== 'union' || seen.has(def)) return [branch];
    return flattenBranches(def.options ?? [], new Set(seen).add(def));
  });

// A branch's editor. A tagged union owns its discriminant in the chooser, so it
// is dropped from the fields; every other branch is edited whole — including a
// `string` or `array` branch, which is just its own field, not a group.
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
    // On the stack while its fields parse, so a self-reference re-entering it
    // is caught as a cycle. If one was, the object is a recursion anchor.
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
    // Flatten nested unions into sibling branches, then dedup by identity — a
    // self-referential union resolves the same cached member instances twice, so
    // the same schema can appear more than once.
    const branches = [...new Set(flattenBranches(defOf(schema).options ?? []))];
    const tag = defOf(schema).discriminator;
    // Patterns don't need the stack — compute them first.
    const patterns = branches.map((b) => distinguish(b, branches.filter((x) => x !== b), tag));
    // A branch nothing distinguishes is the catch-all: allow exactly one, as the
    // fallback the widget picks when no other pattern matches. Two such branches
    // are ambiguous (which catches a plain value?), so the union still falls back
    // to the raw editor whole.
    const open = patterns.reduce<number[]>((acc, p, i) => (p === undefined ? [...acc, i] : acc), []);
    if (branches.length === 0 || open.length > 1) return { kind: 'unknown' };
    if (open.length === 1) patterns[open[0]!] = { kind: 'fallback' };
    // Parse the branch fields with the union on the stack, so a child that
    // re-enters it (a `children: LayoutNode[]`) is caught as a cycle.
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

// Modifier wrappers that don't change the editing shape — peeled to reach the
// core type, capturing any default along the way. `lazy` is peeled too: it is
// the deferral that makes a schema recursive, resolved here to the schema it
// guards (whose identity the cycle check then recognizes).
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly']);

// A `lazy` is a deferred reference to one schema, but its getter may *build* a
// fresh instance on every call (`z.lazy(() => z.union([...]))`) rather than
// close over a stable const. Cycle detection needs the same resolution each
// time, so resolve each lazy once and reuse it. Keyed by the lazy's def — the
// def owns the getter, and a `.describe()` alias of the lazy shares it, so the
// alias resolves to the same instance instead of a second copy of the tree.
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
    // `lazy` reaches its schema through a memoized getter; the other wrappers
    // through `innerType`. Either may be absent on a malformed def — stop if so.
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
  // A schema already on the stack is a recursion back-edge: stop and record
  // it, so the object it cycles to is tagged when its parse unwinds.
  if (walk.stack.has(defOf(core))) {
    walk.targets.add(defOf(core));
    return { kind: 'self' };
  }
  const body = (parseByType[defOf(core).type] ?? unknownField)(core, walk);
  // Read metadata from both the core and the original, so a `.describe()` on
  // either the type or a wrapper is picked up; the outer one wins.
  const meta = { ...readMeta(core), ...readMeta(schema) };
  return { ...body, ...meta, ...(fallback !== undefined ? { default: fallback } : {}) };
};

export const parse = (schema: ZodType): Field =>
  parseField(schema, { stack: new Set(), targets: new Set() });

// ─── buildDocument: IR → default document ────────────────────
// The default value of a field, by kind. Pure JSON — a model concern, not a
// rendering one. Recursion bottoms out naturally: a recursive object's array
// of itself defaults to empty, so no `self` is ever expanded into a default.

// Each entry takes the whole field; the scalar kinds ignore it, and the two that
// read their own shape (`object`, `union`) narrow with a guard rather than a
// cast — the guard never fires (dispatch keys on `kind`), but it keeps the
// types honest without a type assertion.
const EMPTY: Record<FieldKind, EmptyValue> = {
  string: () => '',
  number: () => 0,
  boolean: () => false,
  // No neutral in-domain value: "no selection" is absence (undefined), which
  // an optional enum accepts and a required one flags — unlike null, which a
  // Zod enum rejects outright. Defaults drop undefined, so no stray key.
  enum: () => undefined,
  array: () => [],
  // Each slot built from its own field; a fixed-length list, so no growth.
  tuple: (field, options) => (field.kind === 'tuple' ? field.items.map((item) => buildDocument(item, options)) : []),
  // A recursion point has no value of its own; the array holding it defaults to [].
  self: () => undefined,
  unknown: () => null,
  object: (field, options) => {
    if (field.kind !== 'object') return {};
    const includeOptional = options.includeOptional ?? true;
    const document: Record<string, unknown> = {};
    for (const child of field.fields) {
      if (!child.required && !includeOptional) continue;
      const value = buildDocument(child.field, options);
      if (value !== undefined) document[child.key] = value; // no stray undefined keys
    }
    return document;
  },
  // An empty union defaults to its first variant (tag + branch defaults).
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

// A plain object — not an array or null. Guards the spread of a built default
// document, whose static type is `unknown` (so we check rather than assert).
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A branch's default value: whatever its field builds — an object, but also a
// bare `''` or `[]` for a scalar/array branch. A tagged union additionally sets
// its discriminant alongside. Used as an empty union's value and to reshape the
// document when the chooser switches branches.
export const variantDefaults = (variant: Variant): unknown => {
  const defaults = buildDocument(variant.field, {});
  if (variant.pattern.kind !== 'tag') return defaults;
  return { [variant.pattern.key]: variant.pattern.value, ...(isRecord(defaults) ? defaults : {}) };
};
