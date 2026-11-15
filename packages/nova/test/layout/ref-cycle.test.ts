import { describe, expect, it } from 'vitest';
import { createLayoutStore, renderLayout } from '@layout';
import type { LayoutNode, RenderNode } from '@layout';
import { RenderError } from '@shared';
import type { NovaError } from '@shared';
import { createPermissiveRegistry } from '../helpers';

const storeOf = (layouts: Record<string, LayoutNode>) => {
  const store = createLayoutStore();
  for (const [id, layout] of Object.entries(layouts)) store.set(id, layout);
  return store;
};

describe('a stored layout that comes back to itself', () => {
  const loops = { x: { component: 'Box', children: { ref: 'y' } }, y: { component: 'Box', children: [{ ref: 'x' }] } } satisfies Record<string, LayoutNode>;

  it('lax: renders an error naming the refs where the layout would recurse, and reports it', () => {
    const errors: NovaError[] = [];
    const out = renderLayout({ ref: 'x' }, {}, { store: storeOf(loops), registry: createPermissiveRegistry(), onError: (error) => errors.push(error) });
    const error: RenderNode = { type: 'error', code: 'RENDER_ERROR', message: 'Layout ref "x" comes back to itself: x → y → x' };
    expect(out).toEqual([{ type: 'component', name: 'Box', props: {}, children: [{ type: 'component', name: 'Box', props: {}, children: [error] }] }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RenderError);
  });

  it('strict: throws it', () => {
    expect(() => renderLayout({ ref: 'x' }, {}, { store: storeOf({ x: { ref: 'x' } }), registry: createPermissiveRegistry(), strict: true })).toThrow(
      'Layout ref "x" comes back to itself: x → x',
    );
  });

  it('a layout that refers to itself one level down its data still renders', () => {
    const tree: LayoutNode = { component: 'Box', props: { name: '$node.name' }, children: { for: '$node.children', as: 'node', do: { ref: 'tree' } } };
    const data = { root: { name: 'a', children: [{ name: 'b', children: [{ name: 'c', children: [] }] }] } };
    const out = renderLayout({ for: '$.roots', as: 'node', do: { ref: 'tree' } }, { roots: [data.root] }, { store: storeOf({ tree }), registry: createPermissiveRegistry(), strict: true });
    const names: unknown[] = [];
    const walk = (nodes: RenderNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'component') names.push(node.props['name']);
        if (node.type === 'component' || node.type === 'fragment') walk(node.children);
      }
    };
    walk(out);
    expect(names).toEqual(['a', 'b', 'c']);
  });
});
