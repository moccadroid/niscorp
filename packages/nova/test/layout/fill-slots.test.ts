import { describe, expect, it } from 'vitest';
import { fillSlots } from '@layout';
import type { LayoutNode } from '@layout';

describe('fillSlots', () => {
  it('replaces a slot with its fill', () => {
    const tree: LayoutNode = { component: 'Box', children: { slot: 'body' } };
    const out = fillSlots(tree, { body: { component: 'Form' } });
    expect(out).toEqual({ component: 'Box', children: { component: 'Form' } });
  });

  it('replaces slots nested in arrays / conditionals / loops', () => {
    const fill: LayoutNode = { component: 'Form' };
    const tree: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Header' },
        { slot: 'body' },
        { if: '$.x', then: { slot: 'body' }, else: 'none' },
        { for: '$.items', as: 'i', do: { slot: 'body' } },
      ],
    };
    const out = fillSlots(tree, { body: fill }) as { children: LayoutNode[] };
    expect(out.children[1]).toEqual(fill);
    expect((out.children[2] as { then: LayoutNode }).then).toEqual(fill);
    expect((out.children[3] as { do: LayoutNode }).do).toEqual(fill);
  });

  it('leaves an unfilled slot in place (the renderer renders it as nothing)', () => {
    const tree: LayoutNode = { component: 'Box', children: { slot: 'missing' } };
    expect(fillSlots(tree, { body: { component: 'Form' } })).toEqual(tree);
  });

  it('is a no-op on slot-less trees', () => {
    const tree: LayoutNode = { component: 'Box', children: [{ component: 'Text', children: 'hi' }] };
    expect(fillSlots(tree, { body: { component: 'X' } })).toEqual(tree);
  });
});
