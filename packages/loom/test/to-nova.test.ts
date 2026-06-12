import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ActionDefinitionSchema, type ComponentNode } from '@niscorp/nova';
import { parse, toNova, Roles } from '../src/index.js';
import { collectModels, mountForm } from './helpers.js';

// Static metadata props (branches / containers / child) are JSON-encoded so
// Nova's resolver leaves their `$`-bearing data intact; decode to inspect.
const decode = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

// toNova — Loom's field model → a Nova editor. Deliberately boring: Nova's own
// schemas stay examples, not the rig.
const personSchema = z.object({
  name: z.string(),
  age: z.int().optional(),
  active: z.boolean().optional(),
});

const render = (schema: z.ZodType, options?: Parameters<typeof toNova>[1]) => toNova(parse(schema), options);

describe('toNova — object schema', () => {
  it('emits a schema-valid Nova ActionDefinition', () => {
    expect(() => ActionDefinitionSchema.parse(render(personSchema).action)).not.toThrow();
  });

  it('builds a default document per property type', () => {
    expect(render(personSchema).action.data).toEqual({ name: '', age: 0, active: false });
  });

  it('respects an explicit initial document', () => {
    const { action } = render(personSchema, { value: { name: 'Ada', age: 36, active: true } });
    expect(action.data).toEqual({ name: 'Ada', age: 36, active: true });
  });

  it('includes only required properties when includeOptional is false', () => {
    expect(render(personSchema, { includeOptional: false }).action.data).toEqual({ name: '' });
  });

  it('uses the provided id, defaulting to loom-form', () => {
    expect(render(personSchema).action.id).toBe('loom-form');
    expect(render(personSchema, { id: 'person' }).action.id).toBe('person');
  });

  it('builds group → field → control with correct roles, paths, and models', () => {
    const group = render(personSchema.meta({ title: 'Person' })).action.layout as ComponentNode;
    expect(group.component).toBe(Roles.group);
    expect(group.props).toEqual({ title: 'Person' });

    const fields = group.children as ComponentNode[];
    expect(fields).toHaveLength(3);

    const [nameField, ageField, activeField] = fields;
    expect(nameField!.component).toBe(Roles.field);
    expect(nameField!.props).toEqual({ label: 'name', required: true, error: '$._errors.name' });

    const nameControl = nameField!.children as ComponentNode;
    expect(nameControl.component).toBe(Roles.text);
    expect(nameControl.model).toBe('$.name');
    expect(nameControl.ref).toBeUndefined(); // no explicit ref — the renderer derives one

    expect(ageField!.props).toMatchObject({ required: false });
    const ageControl = ageField!.children as ComponentNode;
    expect(ageControl.component).toBe(Roles.number);
    expect(ageControl.props).toEqual({ integer: true });

    const activeControl = activeField!.children as ComponentNode;
    expect(activeControl.component).toBe(Roles.checkbox);
    expect(activeControl.model).toBe('$.active');
  });

  it('round-trips a ui:model edit through Nova into the document', () => {
    const { shell, runtime } = mountForm(render(personSchema));
    const models = collectModels(runtime.render()); // render installs listeners

    const nameRef = models.find((m) => m.path === 'name')?.ref;
    expect(nameRef).toBeTruthy();
    shell.dispatch({ type: 'ui:model', ref: nameRef!, payload: 'Ada' });
    expect(runtime.getData()).toMatchObject({ name: 'Ada' });

    const activeRef = models.find((m) => m.path === 'active')?.ref;
    shell.dispatch({ type: 'ui:model', ref: activeRef!, payload: true });
    expect(runtime.getData()).toMatchObject({ name: 'Ada', active: true });

    shell.dispose();
  });

  // The variant carries each branch's pattern + defaults as props and its branch
  // editors as children; the widget matches the value to a branch and shows it.
  const variantOf = (action: { layout?: unknown }): ComponentNode =>
    ((action.layout as ComponentNode).children as ComponentNode[])[0]!.children as ComponentNode;
  const branchesOf = (variant: ComponentNode) =>
    decode((variant.props as { branches: unknown }).branches) as { label: string; pattern: unknown; defaults: unknown; childrenKey?: string }[];
  // Each child is a `branch` wrapper around the branch's editor.
  const editorsOf = (variant: ComponentNode): ComponentNode[] =>
    (variant.children as ComponentNode[]).map((wrap) => wrap.children as ComponentNode);

  it('compiles a discriminated union: tag patterns + branch editors as children', () => {
    const { action } = render(
      z.object({
        shape: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('circle'), radius: z.number() }),
          z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
        ]),
      }),
    );
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();
    expect(action.data).toEqual({ shape: { kind: 'circle', radius: 0 } });

    const variant = variantOf(action);
    expect(variant.component).toBe(Roles.variant);
    expect(variant.model).toBe('$.shape');

    const branches = branchesOf(variant);
    expect(branches[0]).toMatchObject({ pattern: { kind: 'tag', key: 'kind', value: 'circle' }, defaults: { kind: 'circle', radius: 0 } });
    expect(branches[1]).toMatchObject({ pattern: { kind: 'tag', key: 'kind', value: 'rect' }, defaults: { kind: 'rect', w: 0, h: 0 } });

    // Each child is a `branch` wrapper (no `{ if: … }` conditionals), holding its editor.
    const wrappers = variant.children as ComponentNode[];
    expect(wrappers).toHaveLength(2);
    expect(wrappers.every((w) => w.component === Roles.branch)).toBe(true);
    expect(wrappers.every((w) => 'if' in w)).toBe(false);
  });

  it('compiles a structural union by key presence', () => {
    const { action } = render(
      z.object({
        block: z.union([z.object({ text: z.string() }), z.object({ image: z.string(), alt: z.string() })]),
      }),
    );
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();
    expect(action.data).toEqual({ block: { text: '' } });

    const branches = branchesOf(variantOf(action));
    expect(branches[0]).toMatchObject({ pattern: { kind: 'key', key: 'text' }, defaults: { text: '' } });
    expect(branches[1]).toMatchObject({ pattern: { kind: 'key', key: 'image' }, defaults: { image: '', alt: '' } });
  });

  it('compiles a mixed union (object + string + array) by key and by type', () => {
    const { action } = render(
      z.object({
        node: z.union([z.object({ component: z.string() }), z.string(), z.array(z.string())]),
      }),
    );
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();
    // Defaults to the first branch (the object).
    expect(action.data).toEqual({ node: { component: '' } });

    const variant = variantOf(action);
    const branches = branchesOf(variant);
    expect(branches[0]).toMatchObject({ pattern: { kind: 'key', key: 'component' }, defaults: { component: '' } });
    // The non-object branches discriminate by type, and default to a scalar / array — not {}.
    expect(branches[1]).toMatchObject({ pattern: { kind: 'type', type: 'string' }, defaults: '' });
    expect(branches[2]).toMatchObject({ pattern: { kind: 'type', type: 'array' }, defaults: [] });

    // Each branch's editor matches its kind: a group, a text control, an array.
    const editors = editorsOf(variant);
    expect(editors[0]!.component).toBe(Roles.group);
    expect(editors[1]!.component).toBe(Roles.text);
    expect(editors[2]!.component).toBe(Roles.array);
  });

  it('rejects a non-object root', () => {
    expect(() => render(z.string())).toThrow(/object/);
  });

  it('compiles an array to a loop with model-write controls — no triggers', () => {
    const { action } = render(z.object({ tags: z.array(z.string()) }));
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();
    expect(action.data).toEqual({ tags: [] });
    // Every list op is a model write, so the action carries no triggers.
    expect(action.triggers).toBeUndefined();

    // group → field(tags) → array → [ loop over $.tags, append bound to $.tags ].
    const group = action.layout as ComponentNode;
    const array = (group.children as ComponentNode[])[0]!.children as ComponentNode;
    expect(array.component).toBe(Roles.array);

    const [loop, add] = array.children as [Record<string, unknown>, ComponentNode];
    expect(loop).toMatchObject({ for: '$.tags', as: 'item' });
    expect(add).toMatchObject({ component: Roles.append, model: '$.tags' });
    expect(decode((add.props as { child: unknown }).child)).toBe('');

    // Each row is [ editor cell (a box), actions menu ] — the menu binds `$items`
    // and acts on its own `$index`. A plain list has no container variants, so no
    // `containers` prop is emitted.
    const row = loop.do as ComponentNode;
    expect(row.component).toBe(Roles.arrayItem);
    const [cell, menu] = row.children as ComponentNode[];
    expect(cell!.component).toBe(Roles.box);
    expect((cell!.children as ComponentNode).model).toBe('$item');
    expect(menu!).toMatchObject({ component: Roles.rowMenu, model: '$items', props: { index: '$index' } });
    expect((menu!.props as { containers?: unknown }).containers).toBeUndefined();
  });
});

describe('toNova — recursion', () => {
  // A comment tree: a node with a body and a list of replies of the same shape.
  const Comment = z.object({
    body: z.string(),
    get replies() {
      return z.array(Comment);
    },
  });
  const commentSchema = z.object({ thread: Comment });

  it('emits a schema-valid action plus one self-referencing template', () => {
    const { action, layouts } = render(commentSchema);
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();

    const names = Object.keys(layouts);
    expect(names).toHaveLength(1);
    const template = layouts[names[0]!] as ComponentNode;
    expect(template.component).toBe(Roles.group);

    // The template's replies array loops over `$item.replies`; each child is a
    // row of [ editor cell (a box wrapping the ref-back-to-template), ✕, ↑, ↓ ].
    const repliesField = (template.children as ComponentNode[]).find(
      (c) => (c.props as { label?: string }).label === 'replies',
    )!;
    const repliesArray = repliesField.children as ComponentNode;
    const [loop, add] = repliesArray.children as [Record<string, unknown>, ComponentNode];
    expect(loop).toMatchObject({ for: '$item.replies', as: 'item' });

    const row = loop.do as ComponentNode;
    expect(row.component).toBe(Roles.arrayItem);
    const [cell, menu] = row.children as ComponentNode[];
    expect(cell).toEqual({ component: Roles.box, children: { ref: names[0] } });
    // The menu writes the *whole list* back: bound to `$items`, acting on its own
    // `$index` — depth-agnostic, no static target.
    expect(menu).toMatchObject({ component: Roles.rowMenu, model: '$items', props: { index: '$index' } });

    // The add control appends a default child to this node's own list.
    expect(add.component).toBe(Roles.append);
    expect(add.model).toBe('$item.replies');
    expect(decode((add.props as { child: unknown }).child)).toEqual({ body: '', replies: [] });
  });

  it('builds a finite default document (recursion bottoms out at an empty list)', () => {
    expect(render(commentSchema).action.data).toEqual({ thread: { body: '', replies: [] } });
  });

  it('grows a nested reply via the append model-write, at depth', () => {
    const initial = { thread: { body: 'root', replies: [{ body: 'child', replies: [] }] } };
    const { shell, runtime } = mountForm(render(commentSchema, { value: initial }));
    const models = collectModels(runtime.render());

    // The append bound to the *nested* child's replies (resolved at depth).
    const nestedReplies = models.find((m) => m.path === 'thread.replies.0.replies');
    expect(nestedReplies).toBeTruthy();
    shell.dispatch({
      type: 'ui:model',
      ref: nestedReplies!.ref,
      payload: [{ body: 'grandchild', replies: [] }],
    });

    expect(runtime.getData()).toMatchObject({
      thread: { replies: [{ body: 'child', replies: [{ body: 'grandchild', replies: [] }] }] },
    });
    shell.dispose();
  });

  it('removes an element via the $items row control (the list write replaces the list)', () => {
    const initial = {
      thread: { body: 'root', replies: [{ body: 'a', replies: [] }, { body: 'b', replies: [] }] },
    };
    const { shell, runtime } = mountForm(render(commentSchema, { value: initial }));
    const models = collectModels(runtime.render());

    // The row controls bind `$items` (the list itself), distinct from the append
    // (which binds `$item.replies`). Removing index 0 writes the list without it.
    const listCtrl = models.find((m) => m.path === 'thread.replies' && m.ref.includes('row-menu'));
    expect(listCtrl).toBeTruthy();
    shell.dispatch({ type: 'ui:model', ref: listCtrl!.ref, payload: [{ body: 'b', replies: [] }] });

    const replies = (runtime.getData().thread as { replies: unknown[] }).replies;
    expect(replies).toEqual([{ body: 'b', replies: [] }]);
    shell.dispose();
  });

  it('compiles a recursive *union* (a tree of typed nodes) to a self-referencing template', () => {
    // A node is a Box (children recurse) or a Text (leaf) — a Nova-layout shape.
    const node: z.ZodType = z.discriminatedUnion('component', [
      z.object({ component: z.literal('Box'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Text'), text: z.string() }),
    ]);
    const ir = parse(z.object({ root: node }));
    if (ir.kind !== 'object') throw new Error('expected object');
    const root = ir.fields[0]!.field;
    if (root.kind !== 'union') throw new Error('expected union');
    expect(root.recursive).toBe(true);
    // The Box branch's children are an array of `self` (back to the union).
    const box = root.variants.find((v) => v.pattern.kind === 'tag' && v.pattern.value === 'Box')!;
    if (box.field.kind !== 'object') throw new Error('expected object branch');
    const children = box.field.fields.find((f) => f.key === 'children')!.field;
    expect(children).toMatchObject({ kind: 'array', item: { kind: 'self' } });

    // toNova emits the union once as a named template; the `self` refs it.
    const { action, layouts } = toNova(parse(z.object({ root: node })));
    expect(() => ActionDefinitionSchema.parse(action)).not.toThrow();
    expect(Object.keys(layouts)).toHaveLength(1);
  });

  it('a recursive container’s children list writes through $items (reorder/remove at the root)', () => {
    const node: z.ZodType = z.discriminatedUnion('component', [
      z.object({ component: z.literal('Box'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Text'), text: z.string() }),
    ]);
    const schema = z.object({ layout: node });
    const seed = {
      layout: { component: 'Box', children: [{ component: 'Text', text: 'a' }, { component: 'Text', text: 'b' }] },
    };
    const { shell, runtime } = mountForm(toNova(parse(schema), { value: seed }));
    const ctrl = collectModels(runtime.render()).find(
      (m) => m.path === 'layout.children' && m.ref.includes('row-menu'),
    );
    expect(ctrl).toBeTruthy();
    shell.dispatch({
      type: 'ui:model',
      ref: ctrl!.ref,
      payload: [{ component: 'Text', text: 'b' }, { component: 'Text', text: 'a' }],
    });
    const children = (runtime.getData().layout as { children: { text: string }[] }).children;
    expect(children.map((c) => c.text)).toEqual(['b', 'a']);
    shell.dispose();
  });

  it('exposes container variants to the chooser and the row menu', () => {
    const node: z.ZodType = z.discriminatedUnion('component', [
      z.object({ component: z.literal('Box'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Stack'), children: z.array(z.lazy(() => node)) }),
      z.object({ component: z.literal('Text'), text: z.string() }),
    ]);
    const { layouts } = toNova(parse(z.object({ layout: node })));
    const template = Object.values(layouts)[0] as ComponentNode;

    // The chooser carries `childrenKey` on the container branches, not on Text.
    const branches = decode((template.props as { branches: unknown }).branches) as { label: string; childrenKey?: string }[];
    const childrenKeyOf = (label: string) => branches.find((b) => b.label === label)!.childrenKey;
    expect(childrenKeyOf('Box')).toBe('children');
    expect(childrenKeyOf('Stack')).toBe('children');
    expect(childrenKeyOf('Text')).toBeUndefined();

    // The children-list row menu carries the container variants (Box, Stack).
    const menus: ComponentNode[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n === null || typeof n !== 'object') return;
      const node = n as ComponentNode & { do?: unknown };
      if (node.component === Roles.rowMenu) menus.push(node);
      walk(node.children);
      walk(node.do);
    };
    walk(template);
    const containers = decode((menus[0]!.props as { containers: unknown }).containers) as { label: string; key: string }[];
    expect(containers.map((c) => c.label)).toEqual(['Box', 'Stack']);
    expect(containers.every((c) => c.key === 'children')).toBe(true);
  });
});
