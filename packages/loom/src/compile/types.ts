// Loom is the Nisc editor: the input is a Zod schema (`ZodType`), since every
// Nisc artifact is defined in Zod. `parse` walks the schema into the field
// model below; `toNova` turns that model into a Nova editor. This file is the
// model — pure data, no Nova. The model is what Loom edits; Nova is only how
// it renders, and that coupling lives entirely in `to-nova.ts`.

// ─── The field model (IR) ────────────────────────────────────
// Zod has many ways to express the same shape; the parser normalizes it into
// this flat, directly-dispatchable model once. Every later stage keys off
// `kind`. Each kind maps to exactly one widget (or, for object/array, a
// composition of widgets).

export type EnumOption = { value: unknown; label: string };
export type ObjectField = { key: string; required: boolean; field: Field };
// How a union branch is recognized in a value — the one fact discrimination
// turns on. `tag`: a shared field equals a literal (`z.discriminatedUnion`).
// `key`: a field unique to this branch is present (a structural union). `type`:
// the value's own JS type is unique to this branch (a string or array among
// objects — a mixed union). `fallback`: the one branch nothing else matches,
// for a union with a single open/catch-all member (e.g. an unconstrained
// object among tagged ops); it never matches positively, so the variant widget
// selects it only when no other pattern does. The widget reads it; nothing else.
export type Pattern =
  | { kind: 'tag'; key: string; value: unknown }
  | { kind: 'key'; key: string }
  | { kind: 'type'; type: string }
  | { kind: 'fallback' };
// One branch of a union: a label, the branch's editor, and the pattern that
// recognizes it.
export type Variant = { label: string; field: Field; pattern: Pattern };
export type FieldMeta = { title?: string; description?: string; default?: unknown };

type Of<Body> = Body & FieldMeta;

export type Field =
  | Of<{ kind: 'string'; format?: string }>
  | Of<{ kind: 'number'; integer?: boolean }>
  | Of<{ kind: 'boolean' }>
  | Of<{ kind: 'enum'; options: EnumOption[] }>
  // `recursive` marks an object the parser re-entered: a `self` somewhere in
  // its subtree points back to it. The renderer turns it into a reusable
  // template so depth follows the data instead of the schema.
  | Of<{ kind: 'object'; fields: ObjectField[]; recursive?: boolean }>
  | Of<{ kind: 'array'; item: Field }>
  // A fixed-length, positional list: each slot its own field (`z.tuple`). Unlike
  // an array, slots are not added or removed; unlike an object, they are indexed,
  // not keyed.
  | Of<{ kind: 'tuple'; items: Field[] }>
  // `recursive` marks a union the parser re-entered — a tree of typed nodes
  // (a Nova layout, a nested filter). Like a recursive object, it renders as a
  // reusable template the `self` inside points back to.
  | Of<{ kind: 'union'; variants: Variant[]; recursive?: boolean }>
  // The back-edge of a recursive schema: "the enclosing recursive object
  // appears again here." Finite where the schema is not — the parser stops
  // expanding and the data decides how deep it actually goes.
  | Of<{ kind: 'self' }>
  | Of<{ kind: 'unknown' }>;

export type FieldKind = Field['kind'];

// ─── Custom widgets ──────────────────────────────────────────
// A plugin upgrades specific fields (a Vex field-path picker, a Nova binding
// editor) by matching them and supplying a component. Matching is structural —
// over where a field sits — so it happens at compile time and decides which
// component a field renders with. `path` is the field's dot path within its
// scope (`fields.*`, `sort.*.field`, `…eq`); array items are `*`, and a
// recursive template restarts the path, so a matcher targets by suffix
// (`endsWith('.eq')`) and stays depth-agnostic. The component (and any data it
// needs) lives in the React layer, keyed by `role`.
export type FieldContext = { kind: FieldKind; path: string; title?: string; description?: string };
export type WidgetMatcher = { role: string; match: (field: FieldContext) => boolean };

// ─── Compile options ─────────────────────────────────────────

export type EmptyValue = (field: Field, options: CompileOptions) => unknown;

export type CompileOptions = {
  /** Definition id for the emitted action. Defaults to `'loom-form'`. */
  id?: string;
  /** Initial document to edit. Derived from the schema when omitted. */
  value?: Record<string, unknown>;
  /**
   * Bind the root field under this key instead of at the bare document root. A
   * non-object root (a union, scalar, or array) compiles to a single control,
   * which can't bind the document root (`$` resolves to no readable/writable
   * value); wrapping it under a key gives it a real path. The document is shaped
   * as `{ [rootKey]: value }`; callers that want the raw value unwrap the key.
   */
  rootKey?: string;
  /**
   * Give optional (non-required) object properties their defaults too. When
   * false, optional properties start absent. Defaults to true.
   */
  includeOptional?: boolean;
  /** Per-kind overrides for the empty value of a field that has no schema default. */
  empty?: Partial<Record<FieldKind, EmptyValue>>;
  /**
   * Custom widgets: the first whose `match` accepts a field replaces its default
   * editor with the component registered under `role`. Used by plugins.
   */
  widgets?: WidgetMatcher[];
};
