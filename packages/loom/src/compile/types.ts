export type EnumOption = { value: unknown; label: string };
export type ObjectField = { key: string; required: boolean; field: Field };
export type Pattern =
  | { kind: 'tag'; key: string; value: unknown }
  | { kind: 'key'; key: string }
  | { kind: 'type'; type: string }
  | { kind: 'fallback' };
export type Variant = { label: string; field: Field; pattern: Pattern };
export type FieldMeta = { title?: string; description?: string; default?: unknown };

type Of<Body> = Body & FieldMeta;

export type Field =
  | Of<{ kind: 'string'; format?: string }>
  | Of<{ kind: 'number'; integer?: boolean }>
  | Of<{ kind: 'boolean' }>
  | Of<{ kind: 'enum'; options: EnumOption[] }>
  | Of<{ kind: 'object'; fields: ObjectField[]; recursive?: boolean }>
  | Of<{ kind: 'array'; item: Field }>
  | Of<{ kind: 'tuple'; items: Field[] }>
  | Of<{ kind: 'union'; variants: Variant[]; recursive?: boolean }>
  | Of<{ kind: 'self' }>
  | Of<{ kind: 'unknown' }>;

export type FieldKind = Field['kind'];

// `path` is the field's dot path, with `*` for an array item (`fields.*`,
// `sort.*.field`). A recursive template restarts it, so a matcher that has to
// hit at any depth tests a suffix (`endsWith('.eq')`).
export type FieldContext = { kind: FieldKind; path: string; title?: string; description?: string };
export type WidgetMatcher = { role: string; match: (field: FieldContext) => boolean };

export type EmptyValue = (field: Field, options: CompileOptions) => unknown;

export type CompileOptions = {
  id?: string;
  value?: Record<string, unknown>;
  rootKey?: string;
  includeOptional?: boolean;
  empty?: Partial<Record<FieldKind, EmptyValue>>;
  widgets?: WidgetMatcher[];
};
