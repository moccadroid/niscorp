import type { ActionDefinition, ComponentNode, LayoutNode } from '@niscorp/nova';
import { buildDocument, isRecord, variantDefaults } from './parse.js';
import { Roles, type Role } from './roles.js';
import type { CompileOptions, Field, ObjectField, Pattern, Variant } from './types.js';

export const ERROR_NAMESPACE = '_errors';

const ITEM = 'item';
const INDEX = '$index';
const ITEM_EXPR = `$${ITEM}`;
const LIST_EXPR = '$items';

export type NovaEditor = { action: ActionDefinition; layouts: Record<string, LayoutNode> };

type Container = { label: string; pattern: Pattern; defaults: unknown; key: string };

type Template = { name: string; defaultChild: unknown; containers: Container[] };

type BuildContext = {
  register: (name: string, node: LayoutNode) => void;
  templates: Template[];
  name: () => string;
  widgetRole: (field: Field, path: string) => string | undefined;
  options: CompileOptions;
};

type Build<K extends Field['kind']> = (
  field: Extract<Field, { kind: K }>,
  loc: Loc,
  ctx: BuildContext,
) => LayoutNode;

type Loc = { expr: string; path: string };

const ROOT: Loc = { expr: '$', path: '' };

const child = (loc: Loc, key: string): Loc => ({
  expr: `${loc.expr}.${key}`,
  path: loc.path === '' ? key : `${loc.path}.${key}`,
});

const itemLoc = (loc: Loc): Loc => ({ expr: ITEM_EXPR, path: loc.path === '' ? '*' : `${loc.path}.*` });

const TEMPLATE_ROOT: Loc = { expr: ITEM_EXPR, path: '' };

const errorBinding = (expr: string): string | undefined =>
  expr.startsWith('$.') ? `$.${ERROR_NAMESPACE}.${expr.slice(2)}` : undefined;

const withProps = (node: ComponentNode, props: Record<string, unknown>): ComponentNode =>
  Object.keys(props).length > 0 ? { ...node, props } : node;

const control = (role: Role | string, expr: string, props: Record<string, unknown> = {}): ComponentNode =>
  withProps({ component: role, model: expr }, props);

// Nova resolves every prop as a binding expression: a `$`-prefixed string in it
// is read as a path, and a key such as `$eq` or `$if` is evaluated as a
// directive. So the data goes in as one JSON string, which the component decodes.
const literal = (data: unknown): string | undefined => (data === undefined ? undefined : JSON.stringify(data));

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

const titleProps = (field: { title?: string }): Record<string, unknown> =>
  field.title !== undefined ? { title: field.title } : {};

const withTitle = (node: ComponentNode, field: { title?: string }): ComponentNode =>
  withProps(node, titleProps(field));

const stringBuild: Build<'string'> = (field, loc) =>
  control(Roles.text, loc.expr, field.format !== undefined ? { format: field.format } : {});

const numberBuild: Build<'number'> = (field, loc) =>
  control(Roles.number, loc.expr, field.integer ? { integer: true } : {});

const booleanBuild: Build<'boolean'> = (_field, loc) => control(Roles.checkbox, loc.expr);

const enumBuild: Build<'enum'> = (field, loc) => control(Roles.select, loc.expr, { options: field.options });

const unknownBuild: Build<'unknown'> = (_field, loc) => control(Roles.raw, loc.expr);

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
  const name = ctx.name();
  ctx.templates.push({ name, defaultChild: buildDocument(field, ctx.options), containers: [] });
  ctx.register(name, buildGroup(field, TEMPLATE_ROOT, ctx));
  const inline = buildGroup(field, loc, ctx);
  ctx.templates.pop();
  return inline;
};

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
  // The template binds `$item`, so a `self` references it only as an array item,
  // where the loop binds the element. A `self` anywhere else (a linked list) has
  // no loop to bind it and gets the raw editor.
  if (template !== undefined && loc.expr === ITEM_EXPR) return { ref: template.name };
  return control(Roles.raw, loc.expr);
};

const defaultItem = (field: Extract<Field, { kind: 'array' }>, ctx: BuildContext): unknown =>
  field.item.kind === 'self'
    ? ctx.templates[ctx.templates.length - 1]?.defaultChild
    : buildDocument(field.item, ctx.options);

const childrenKey = (field: Field): string | undefined => {
  if (field.kind !== 'object') return undefined;
  return field.fields.find((f) => f.field.kind === 'array' && f.field.item.kind === 'self')?.key;
};

const containersOf = (variants: Variant[]): Container[] =>
  variants.flatMap((variant) => {
    const key = childrenKey(variant.field);
    return key === undefined ? [] : [{ label: variant.label, pattern: variant.pattern, defaults: variantDefaults(variant), key }];
  });

const arrayBuild: Build<'array'> = (field, loc, ctx) => {
  const containers = field.item.kind === 'self' ? ctx.templates[ctx.templates.length - 1]?.containers ?? [] : [];
  const itemRow: LayoutNode = {
    component: Roles.arrayItem,
    children: [
      { component: Roles.box, children: buildLayout(field.item, itemLoc(loc), ctx) },
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

const buildVariant = (field: Extract<Field, { kind: 'union' }>, loc: Loc, ctx: BuildContext): ComponentNode =>
  withProps(
    {
      component: Roles.variant,
      model: loc.expr,
      children: field.variants.map((variant: Variant, index) => ({
        component: Roles.branch,
        props: { index },
        children: buildLayout(variant.field, loc, ctx),
      })),
    },
    {
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
  const name = ctx.name();
  const first = field.variants[0];
  ctx.templates.push({ name, defaultChild: first !== undefined ? variantDefaults(first) : {}, containers: containersOf(field.variants) });
  ctx.register(name, buildVariant(field, TEMPLATE_ROOT, ctx));
  const inline = buildVariant(field, loc, ctx);
  ctx.templates.pop();
  return inline;
};

const buildLayout = (field: Field, loc: Loc, ctx: BuildContext): LayoutNode => {
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
    widgetRole: (field, path) =>
      matchers.find((matcher) =>
        matcher.match({ kind: field.kind, path, title: field.title, description: field.description }),
      )?.role,
    options,
  };

  // A non-object root (a union, scalar or array) is a single control, and a
  // control cannot bind the bare `$`: `rootKey` binds it one level in.
  const rootLoc: Loc = options.rootKey !== undefined ? { expr: `$.${options.rootKey}`, path: '' } : ROOT;
  const layout = buildLayout(ir, rootLoc, ctx);
  const value = options.value ?? buildDocument(ir, options);
  const document = options.rootKey !== undefined ? { [options.rootKey]: value } : value;
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
