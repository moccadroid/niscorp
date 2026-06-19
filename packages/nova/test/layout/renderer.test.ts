import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
} from '@layout';
import type { ComponentNode, LayoutNode, RenderContext } from '@layout';

const makeCtx = (): RenderContext => ({
  store: createLayoutStore(),
  registry: createPermissiveRegistry(),
});

describe('renderLayout — primitives', () => {
  it('renders a string as text', () => {
    const out = renderLayout('hello', {}, makeCtx());
    expect(out).toEqual([{ type: 'text', value: 'hello' }]);
  });

  it('resolves a $-string against data', () => {
    const out = renderLayout('$.name', { name: 'Ada' }, makeCtx());
    expect(out).toEqual([{ type: 'text', value: 'Ada' }]);
  });

  it('renders numbers and booleans as text', () => {
    expect(renderLayout(42, {}, makeCtx())).toEqual([{ type: 'text', value: '42' }]);
    expect(renderLayout(true, {}, makeCtx())).toEqual([{ type: 'text', value: 'true' }]);
  });

  it('renders null as empty text', () => {
    expect(renderLayout(null, {}, makeCtx())).toEqual([{ type: 'text', value: '' }]);
  });
});

describe('renderLayout — components', () => {
  it('renders a component node with resolved props', () => {
    const node: ComponentNode = {
      component: 'Text',
      props: { value: '$.msg', static: 'literal' },
    };
    const [out] = renderLayout(node, { msg: 'hi' }, makeCtx());
    expect(out).toEqual({
      type: 'component',
      name: 'Text',
      props: { value: 'hi', static: 'literal' },
      children: [],
    });
  });

  it('renders children', () => {
    const node: ComponentNode = {
      component: 'Stack',
      children: [
        { component: 'Text', props: { value: 'a' } },
        { component: 'Text', props: { value: 'b' } },
      ],
    };
    const [out] = renderLayout(node, {}, makeCtx());
    if (!out || out.type !== 'component') throw new Error('expected component');
    expect(out.children.length).toBe(2);
  });

  it('preserves ref', () => {
    const node: ComponentNode = { component: 'Button', ref: 'submit' };
    const [out] = renderLayout(node, {}, makeCtx());
    if (!out || out.type !== 'component') throw new Error('expected component');
    expect(out.ref).toBe('submit');
  });

  it('resolves template strings in props', () => {
    const node: ComponentNode = {
      component: 'Text',
      props: { value: 'Hello {{$.name}}' },
    };
    const [out] = renderLayout(node, { name: 'World' }, makeCtx());
    if (!out || out.type !== 'component') throw new Error('expected component');
    expect(out.props['value']).toBe('Hello World');
  });
});

describe('renderLayout — conditionals', () => {
  it('renders then when truthy', () => {
    const node: LayoutNode = { if: '$.show', then: 'A', else: 'B' };
    expect(renderLayout(node, { show: true }, makeCtx())).toEqual([{ type: 'text', value: 'A' }]);
  });

  it('renders else when falsy', () => {
    const node: LayoutNode = { if: '$.show', then: 'A', else: 'B' };
    expect(renderLayout(node, { show: false }, makeCtx())).toEqual([{ type: 'text', value: 'B' }]);
  });

  it('renders nothing when falsy without else', () => {
    const node: LayoutNode = { if: '$.show', then: 'A' };
    expect(renderLayout(node, { show: false }, makeCtx())).toEqual([]);
  });
});

describe('renderLayout — loops', () => {
  it('iterates an array binding', () => {
    const node: LayoutNode = {
      for: '$.items',
      as: 'item',
      do: { component: 'Text', props: { value: '$item' } },
    };
    const [frag] = renderLayout(node, { items: ['a', 'b', 'c'] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    expect(frag.children.length).toBe(3);
    const first = frag.children[0];
    if (!first || first.type !== 'component') throw new Error('expected component');
    expect(first.props['value']).toBe('a');
  });

  it('stamps a stable React key from `key`, distinct from a shared `ref`', () => {
    const node: LayoutNode = {
      for: '$.rows',
      as: 'r',
      key: 'id',
      do: { component: 'Grid', ref: 'row', props: { v: '$r.id' } },
    };
    const [frag] = renderLayout(node, { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    // Identity comes from the row id — so rows survive sort/filter without remount...
    expect(frag.children.map((c) => c.key)).toEqual(['a', 'b', 'c']);
    // ...while every row keeps the SAME ref (the event-target the trigger matches).
    for (const c of frag.children) {
      if (c.type !== 'component') throw new Error('expected component');
      expect(c.ref).toBe('row');
    }
  });

  it('falls back to the index for the React key when no `key` path is given', () => {
    const node: LayoutNode = { for: '$.rows', as: 'r', do: { component: 'Text', props: { v: '$r' } } };
    const [frag] = renderLayout(node, { rows: ['x', 'y'] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    expect(frag.children.map((c) => c.key)).toEqual(['0', '1']);
  });

  it('exposes $index', () => {
    const node: LayoutNode = {
      for: '$.items',
      as: 'item',
      do: { component: 'Text', props: { i: '$index', v: '$item' } },
    };
    const [frag] = renderLayout(node, { items: ['x', 'y'] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const second = frag.children[1];
    if (!second || second.type !== 'component') throw new Error('expected component');
    expect(second.props['i']).toBe(1);
    expect(second.props['v']).toBe('y');
  });

  it('exposes $items — the whole array — to a control inside the loop', () => {
    const node: LayoutNode = {
      for: '$.items',
      as: 'item',
      do: { component: 'Text', props: { all: '$items', v: '$item' } },
    };
    const [frag] = renderLayout(node, { items: ['x', 'y'] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const first = frag.children[0];
    if (!first || first.type !== 'component') throw new Error('expected component');
    expect(first.props['all']).toEqual(['x', 'y']); // the array, not the element
    expect(first.props['v']).toBe('x');
  });

  it('binds $items to the list path, so `model: "$items"` is writable', () => {
    const node: LayoutNode = {
      for: '$.items',
      as: 'item',
      do: { component: 'Ctrl', model: '$items' },
    };
    const [frag] = renderLayout(node, { items: ['x', 'y'] }, makeCtx());
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const first = frag.children[0];
    if (!first || first.type !== 'component') throw new Error('expected component');
    // Resolves to the array's own path (not an element's), and auto-derives its
    // value from it — a control can read the list and write a new one back.
    expect(first.model?.path).toBe('items');
    expect(first.props['value']).toEqual(['x', 'y']);
  });

  it('shadows $items innermost-first across nested loops', () => {
    const node: LayoutNode = {
      for: '$.groups',
      as: 'g',
      do: {
        for: '$g.tags',
        as: 'tag',
        do: { component: 'Text', model: '$items', props: { here: '$items' } },
      },
    };
    const data = { groups: [{ tags: ['a', 'b'] }, { tags: ['c'] }] };
    const [outer] = renderLayout(node, data, makeCtx());
    if (!outer || outer.type !== 'fragment') throw new Error('expected fragment');
    const innerFrag = outer.children[0];
    if (!innerFrag || innerFrag.type !== 'fragment') throw new Error('expected nested fragment');
    const leaf = innerFrag.children[0];
    if (!leaf || leaf.type !== 'component') throw new Error('expected component');
    // The inner loop's `$items` is the inner list (the outer's doesn't leak).
    expect(leaf.props['here']).toEqual(['a', 'b']);
    expect(leaf.model?.path).toBe('groups.0.tags');
  });

  it('returns empty fragment for non-array', () => {
    const node: LayoutNode = { for: '$.missing', as: 'x', do: 'A' };
    expect(renderLayout(node, {}, makeCtx())).toEqual([]);
  });
});

describe('renderLayout — refs', () => {
  it('resolves a layout ref via store', () => {
    const ctx = makeCtx();
    ctx.store.set('greeting', { component: 'Text', props: { value: 'hi' } });
    const out = renderLayout({ ref: 'greeting' }, {}, ctx);
    expect(out.length).toBe(1);
    const first = out[0];
    if (!first || first.type !== 'component') throw new Error('expected component');
    expect(first.name).toBe('Text');
  });

  it('emits an error node for missing ref in lax mode', () => {
    const out = renderLayout({ ref: 'nope' }, {}, makeCtx());
    expect(out).toEqual([
      { type: 'error', code: 'LAYOUT_REF_NOT_FOUND', message: 'Layout ref not found: nope' },
    ]);
  });
});

describe('renderLayout — arrays', () => {
  it('flattens array of nodes into a fragment', () => {
    const out = renderLayout(['a', 'b'], {}, makeCtx());
    expect(out.length).toBe(1);
    const first = out[0];
    if (!first || first.type !== 'fragment') throw new Error('expected fragment');
    expect(first.children.length).toBe(2);
  });
});

describe('renderLayout — nested', () => {
  it('handles nested loops + conditionals + components', () => {
    const node: LayoutNode = {
      component: 'Stack',
      children: {
        for: '$.users',
        as: 'u',
        do: {
          if: '$u.active',
          then: { component: 'Text', props: { value: '$u.name' } },
          else: null,
        },
      },
    };
    const [stack] = renderLayout(
      node,
      { users: [{ name: 'Ada', active: true }, { name: 'Bob', active: false }] },
      makeCtx(),
    );
    if (!stack || stack.type !== 'component') throw new Error('expected component');
    expect(stack.children.length).toBe(1);
    const frag = stack.children[0];
    if (!frag || frag.type !== 'fragment') throw new Error('expected fragment');
    const a = frag.children[0];
    if (!a || a.type !== 'component') throw new Error('expected component');
    expect(a.props['value']).toBe('Ada');
  });
});
