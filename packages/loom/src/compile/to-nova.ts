import type { ActionDefinition, ComponentNode, LayoutNode } from '@niscorp/nova';
import { buildDocument, isRecord, variantDefaults } from './parse.js';
import { Roles, type Role } from './roles.js';
import type { CompileOptions, Field, ObjectField, Pattern, Variant } from './types.js';

// toNova — turn Loom's field model into a Nova editor: a layout + the document
// it edits (+ any named templates a recursive schema needs). This is the
// rendering half, and the only half that speaks Nova. The model (`parse`) knows
// nothing about it. Every edit — including add / remove / reorder — is a model
// write through Nova's `ui:model` pipeline; no action triggers are emitted.
//
//   Field (IR)  ──toNova──▶  { action, layouts }
//
// Fields bind to the document by a *binding expression* threaded through the
// build: `$.name` at the root, `$item` inside an array loop. A recursive object
// is emitted once as a named layout authored against `$item`; its `self`
// reference points back to that layout, and Nova resolves it per render against
// the live data — so the editor goes exactly as deep as the document does.

// The reserved data namespace the editor writes validation errors into and each
// field binds its error slot to. Excluded from the reported document.
export const ERROR_NAMESPACE = '_errors';

// The loop variable an array binds each element under, plus the two other loop
// bindings Nova exposes per iteration: the element's index, and `$items` — the
// whole array — which the row controls write back to (remove / reorder).
const ITEM = 'item';
const INDEX = '$index';
const ITEM_EXPR = `$${ITEM}`;
const LIST_EXPR = '$items';

// What Loom hands Nova: the action plus the named layouts it references. The
// layouts are the recursive templates; for a non-recursive schema it's empty.
export type NovaEditor = { action: ActionDefinition; layouts: Record<string, LayoutNode> };

// A container variant of a recursive union: one whose value can hold a list of
// the same recursive type. `key` is the field that holds that list. Used to
// wrap an element into one, and to recognize / unwrap an element that is one.
// Purely structural — nothing here knows what the schema represents.
type Container = { label: string; pattern: Pattern; defaults: unknown; key: string };

// A recursive template in scope while its object is built: the layout name a
// `self` points back to, the default node an "add" appends, and (for a union)
// the container variants its items can be wrapped into.
type Template = { name: string; defaultChild: unknown; containers: Container[] };

type BuildContext = {
  /** Register a named layout (a recursive object's reusable template). */
  register: (name: string, node: LayoutNode) => void;
  /** The recursive templates currently being built; `self` refs the innermost. */
  templates: Template[];
  /** A fresh, stable layout name for a recursion template. */
  name: () => string;
  /** The custom-widget role for a field at a path, if a plugin matcher claims it. */
  widgetRole: (field: Field, path: string) => string | undefined;
  options: CompileOptions;
};

type Build<K extends Field['kind']> = (
  field: Extract<Field, { kind: K }>,
  loc: Loc,
  ctx: BuildContext,
) => LayoutNode;

// ─── Location: binding expression + structural path ──────────

// Where a field sits: the binding expression Nova resolves at render (`$.from`,
// `$item.eq`), and the structural path a widget matcher targets (`from`,
// `fields.*`, `…eq`). They diverge inside a loop — the expression rebinds to
// `$item`, losing the array key, but the path keeps it (`fields.*`), which is
// exactly what tells the two list-item kinds apart.
type Loc = { expr: string; path: string };

const ROOT: Loc = { expr: '$', path: '' };

// Extend to a child key: `$.a` + `b` → `$.a.b`; path `a` + `b` → `a.b`.
const child = (loc: Loc, key: string): Loc => ({
  expr: `${loc.expr}.${key}`,
  path: loc.path === '' ? key : `${loc.path}.${key}`,
});

// An array element: the loop rebinds the expression to `$item`; the path gains a
// `*` segment (the index, resolved at render, is irrelevant to matching).
const itemLoc = (loc: Loc): Loc => ({ expr: ITEM_EXPR, path: loc.path === '' ? '*' : `${loc.path}.*` });

// A recursive template is authored against `$item` and rooted afresh, so its
// inner paths are scope-relative — a matcher's suffix (`endsWith('.eq')`) still
// hits at any depth.
const TEMPLATE_ROOT: Loc = { expr: ITEM_EXPR, path: '' };

// The error binding for a field, derived from its expression. Only absolute
// (`$.`) expressions map to the error channel; loop-relative item paths
// (`$item…`) carry an index resolved at render and are left for later.
const errorBinding = (expr: string): string | undefined =>
  expr.startsWith('$.') ? `$.${ERROR_NAMESPACE}.${expr.slice(2)}` : undefined;

// ─── Node helpers ────────────────────────────────────────────

// Attach `props` only when there is something to attach — keeps emitted layouts
// free of empty `props: {}` noise.
const withProps = (node: ComponentNode, props: Record<string, unknown>): ComponentNode =>
  Object.keys(props).length > 0 ? { ...node, props } : node;

// A leaf control bound to its expression. No explicit ref: the renderer derives
// one from the resolved path, which is distinct per array element.
const control = (role: Role | string, expr: string, props: Record<string, unknown> = {}): ComponentNode =>
  withProps({ component: role, model: expr }, props);

// Static JSON metadata a component reads (a variant's branches, a list's
// containers, an "add" default) — not a binding. Nova resolves *every* prop as a
// binding expression, so a value carrying `$`-prefixed data (a Prism op key, a
// `$ref`) would be mangled, and a `$eq`/`$if`/`$exists` key would be evaluated as
// a directive. Encoding it as a JSON string passes it through the resolver
// untouched; the component decodes it (`decodeLiteral` in the kit).
const literal = (data: unknown): string | undefined => (data === undefined ? undefined : JSON.stringify(data));

// An object property: a field wrapper (label / required / error chrome) around
// the property's own layout. `loc` already points at the property.
const wrapField = (loc: Loc, prop: ObjectField, ctx: BuildContext): ComponentNode => {
  const error = errorBinding(loc.expr);
  return {
    component: Roles.field,
    props: {
      label: prop.field.title ?? prop.key,
      required: prop.required,
      ...(error !== undefined ? { error } : {}),
      ...(prop.field.description !== undefined ? { description: prop.field.description } : {}),
    },
    children: buildLayout(prop.field, loc, ctx),
  };
};

// A field's optional `title`, as props — shared by the title chrome of groups,
// arrays, and the variant chooser.
const titleProps = (field: { title?: string }): Record<string, unknown> =>
  field.title !== undefined ? { title: field.title } : {};

const withTitle = (node: ComponentNode, field: { title?: string }): ComponentNode =>
  withProps(node, titleProps(field));

// ─── Builds: IR → layout ─────────────────────────────────────

const stringBuild: Build<'string'> = (field, loc) =>
  control(Roles.text, loc.expr, field.format !== undefined ? { format: field.format } : {});

const numberBuild: Build<'number'> = (field, loc) =>
  control(Roles.number, loc.expr, field.integer ? { integer: true } : {});

const booleanBuild: Build<'boolean'> = (_field, loc) => control(Roles.checkbox, loc.expr);

const enumBuild: Build<'enum'> = (field, loc) => control(Roles.select, loc.expr, { options: field.options });

const unknownBuild: Build<'unknown'> = (_field, loc) => control(Roles.raw, loc.expr);

// The group of wrapped fields an object renders as — shared by the inline
// occurrence and the recursive template (same shape, different base loc).
const buildGroup = (field: Extract<Field, { kind: 'object' }>, loc: Loc, ctx: BuildContext): ComponentNode =>
  withTitle(
    {
      component: Roles.group,
      children: field.fields.map((prop) => wrapField(child(loc, prop.key), prop, ctx)),
    },
    field,
  );

const objectBuild: Build<'object'> = (field, loc, ctx) => {
  if (field.recursive !== true) return buildGroup(field, loc, ctx);
  // A recursive object: emit its group once as a named template authored
  // against the template root (so it binds correctly at any depth), keep it in
  // scope so the `self` inside refs it and an "add" knows the default node, then
  // render the object inline at its real loc. Both builds bottom out at `self`.
  const name = ctx.name();
  ctx.templates.push({ name, defaultChild: buildDocument(field, ctx.options), containers: [] });
  ctx.register(name, buildGroup(field, TEMPLATE_ROOT, ctx));
  const inline = buildGroup(field, loc, ctx);
  ctx.templates.pop();
  return inline;
};

// A tuple: one wrapped field per slot, bound to its numeric index (`$.x.0`).
// Fixed-length, so no add / remove — the difference from an array.
const tupleBuild: Build<'tuple'> = (field, loc, ctx) =>
  withTitle(
    {
      component: Roles.group,
      children: field.items.map((item, index) =>
        wrapField(child(loc, String(index)), { key: String(index + 1), required: true, field: item }, ctx),
      ),
    },
    field,
  );

const selfBuild: Build<'self'> = (_field, loc, ctx) => {
  const template = ctx.templates[ctx.templates.length - 1];
  // Reached as an array item (the loop rebinds `$item` to the element), a
  // `self` becomes a reference to the enclosing template — Nova re-resolves it
  // per render against the live data, so depth follows the document. A `self`
  // anywhere else is a direct self-reference (a linked list); it has no loop to
  // rebind its scope, so it shows raw until that case lands.
  if (template !== undefined && loc.expr === ITEM_EXPR) return { ref: template.name };
  return control(Roles.raw, loc.expr);
};

// The default element an "add" appends: for a recursive list, the enclosing
// template's default node; otherwise the item field's own default.
const defaultItem = (field: Extract<Field, { kind: 'array' }>, ctx: BuildContext): unknown =>
  field.item.kind === 'self'
    ? ctx.templates[ctx.templates.length - 1]?.defaultChild
    : buildDocument(field.item, ctx.options);

// The key of a field's child-list, if it has one: an object property that is an
// array of `self` (the same recursive type). This is the whole definition of a
// "container" — structural, with no knowledge of the domain.
const childrenKey = (field: Field): string | undefined => {
  if (field.kind !== 'object') return undefined;
  return field.fields.find((f) => f.field.kind === 'array' && f.field.item.kind === 'self')?.key;
};

// A union's container variants: the ones whose branch holds a child-list.
const containersOf = (variants: Variant[]): Container[] =>
  variants.flatMap((variant) => {
    const key = childrenKey(variant.field);
    return key === undefined ? [] : [{ label: variant.label, pattern: variant.pattern, defaults: variantDefaults(variant), key }];
  });

// A list editor: every element rendered (the recursive item is a `self` ref;
// any other is its own editor), each in a row with an actions menu (✕ / ↑ / ↓,
// and wrap / unwrap when the items are a recursive union with container
// variants), plus an "add". The menu binds the loop's `$items` (the whole list)
// and acts on its own `$index`; the add binds the list itself and appends a
// default. Everything is a `ui:model` write — path resolution handles the
// nesting, so a list edits at any depth with no static target and no triggers.
const arrayBuild: Build<'array'> = (field, loc, ctx) => {
  // Containers come from the recursive union the items belong to (when the item
  // is `self`); a plain list has none, so its menu is just move / remove.
  const containers = field.item.kind === 'self' ? ctx.templates[ctx.templates.length - 1]?.containers ?? [] : [];
  const itemRow: LayoutNode = {
    component: Roles.arrayItem,
    children: [
      { component: Roles.box, children: buildLayout(field.item, itemLoc(loc), ctx) }, // the editor cell — grows
      {
        component: Roles.rowMenu,
        model: LIST_EXPR,
        props: { index: INDEX, ...(containers.length > 0 ? { containers: literal(containers) } : {}) },
      },
    ],
  };
  return withTitle(
    {
      component: Roles.array,
      children: [
        { for: loc.expr, as: ITEM, do: itemRow },
        { component: Roles.append, model: loc.expr, props: { label: 'Add', child: literal(defaultItem(field, ctx)) } },
      ],
    },
    field,
  );
};

// A union is the variant widget bound to the value: it holds each branch's
// pattern + label + default, and renders the branch editors as its children.
// The widget reads the value, matches it to a branch (in JS), and shows that
// child; on change it writes the chosen branch's default. No discrimination is
// compiled into the layout — Nova never learns what a union is.
const buildVariant = (field: Extract<Field, { kind: 'union' }>, loc: Loc, ctx: BuildContext): ComponentNode =>
  withProps(
    {
      component: Roles.variant,
      model: loc.expr,
      // Each branch editor in its own `branch` wrapper, indexed; the widget shows
      // only the one whose index it matched. (Nova hands a component its children
      // as one tree, so the branches need to be individually addressable.) A
      // branch edits the same value, so it shares the union's loc.
      children: field.variants.map((variant: Variant, index) => ({
        component: Roles.branch,
        props: { index },
        children: buildLayout(variant.field, loc, ctx),
      })),
    },
    {
      // `childrenKey` lets the chooser carry children when switching between two
      // container variants (and warn before dropping them otherwise). Encoded as
      // a literal: the patterns and defaults carry `$`-bearing data Nova must not
      // resolve.
      branches: literal(
        field.variants.map((variant: Variant) => ({
          label: variant.label,
          pattern: variant.pattern,
          defaults: variantDefaults(variant),
          ...(childrenKey(variant.field) !== undefined ? { childrenKey: childrenKey(variant.field) } : {}),
        })),
      ),
      ...titleProps(field),
    },
  );

const variantBuild: Build<'union'> = (field, loc, ctx) => {
  if (field.recursive !== true) return buildVariant(field, loc, ctx);
  // A recursive union (a tree of typed nodes): emit the chooser once as a named
  // template authored against the template root, keep it in scope so the `self`
  // inside a branch's children refs it, then render the node inline. Same
  // machinery as a recursive object — the template is just a variant, not a group.
  const name = ctx.name();
  const first = field.variants[0];
  ctx.templates.push({ name, defaultChild: first !== undefined ? variantDefaults(first) : {}, containers: containersOf(field.variants) });
  ctx.register(name, buildVariant(field, TEMPLATE_ROOT, ctx));
  const inline = buildVariant(field, loc, ctx);
  ctx.templates.pop();
  return inline;
};

// Dispatch a field to its build. The switch narrows `field` per case, so each
// build receives its own field type with no assertion; the union is closed, so
// it is also exhaustive (a new kind won't compile until it is handled here).
const buildLayout = (field: Field, loc: Loc, ctx: BuildContext): LayoutNode => {
  // A plugin widget claims this field by where it sits (its structural path) —
  // render with the registered component instead of the type default. It binds
  // the value and a model like any control, so it can be a leaf editor or
  // replace a whole subtree.
  const role = ctx.widgetRole(field, loc.path);
  if (role !== undefined) return control(role, loc.expr);
  switch (field.kind) {
    case 'string':
      return stringBuild(field, loc, ctx);
    case 'number':
      return numberBuild(field, loc, ctx);
    case 'boolean':
      return booleanBuild(field, loc, ctx);
    case 'enum':
      return enumBuild(field, loc, ctx);
    case 'object':
      return objectBuild(field, loc, ctx);
    case 'array':
      return arrayBuild(field, loc, ctx);
    case 'tuple':
      return tupleBuild(field, loc, ctx);
    case 'union':
      return variantBuild(field, loc, ctx);
    case 'self':
      return selfBuild(field, loc, ctx);
    case 'unknown':
      return unknownBuild(field, loc, ctx);
  }
};

// ─── Public entry ────────────────────────────────────────────

export const toNova = (ir: Field, options: CompileOptions = {}): NovaEditor => {
  const layouts: Record<string, LayoutNode> = {};
  let counter = 0;
  const matchers = options.widgets ?? [];
  const ctx: BuildContext = {
    register: (name, node) => {
      layouts[name] = node;
    },
    templates: [],
    name: () => `loom:tree:${counter++}`,
    // Match on where the field sits (its structural path) plus its facts.
    widgetRole: (field, path) =>
      matchers.find((matcher) =>
        matcher.match({ kind: field.kind, path, title: field.title, description: field.description }),
      )?.role,
    options,
  };

  // A non-object root (a union, scalar, or array) is a single control that can't
  // bind the bare document root, so `rootKey` binds it one level in (`$.<key>`)
  // and the document wraps the value under that key. An object root binds `$` and
  // its leaves bind `$.<field>` as usual.
  const rootLoc: Loc = options.rootKey !== undefined ? { expr: `$.${options.rootKey}`, path: '' } : ROOT;
  const layout = buildLayout(ir, rootLoc, ctx);
  const value = options.value ?? buildDocument(ir, options);
  const document = options.rootKey !== undefined ? { [options.rootKey]: value } : value;
  // The action's data must be a record. An object root builds one directly; a
  // wrapped root is a record by construction. A bare scalar root with no key has
  // no record document.
  if (!isRecord(document)) {
    throw new Error('loom.toNova: the root document must be an object (or use rootKey).');
  }
  const action: ActionDefinition = {
    id: options.id ?? 'loom-form',
    data: document,
    layout,
  };
  return { action, layouts };
};
