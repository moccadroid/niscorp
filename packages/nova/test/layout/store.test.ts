import { describe, expect, it } from 'vitest';
import { createLayoutStore } from '@layout';
import type { LayoutNode } from '@layout';

describe('layout store', () => {
  it('CRUDs layouts', () => {
    const store = createLayoutStore();
    expect(store.get('a')).toBeUndefined();
    store.set('a', 'x');
    expect(store.get('a')).toBe('x');
    expect(store.list()).toEqual(['a']);
    store.delete('a');
    expect(store.get('a')).toBeUndefined();
  });

  it('resolveReferences inlines refs', () => {
    const store = createLayoutStore();
    store.set('greeting', { component: 'Text', props: { value: 'hi' } });
    const layout: LayoutNode = { component: 'Stack', children: [{ ref: 'greeting' }] };
    const resolved = store.resolveReferences(layout);
    if (!('component' in resolved) || Array.isArray(resolved)) throw new Error('expected component');
    const children = resolved.children;
    if (!Array.isArray(children)) throw new Error('expected array');
    expect(children[0]).toEqual({ component: 'Text', props: { value: 'hi' } });
  });

  it('resolveReferences handles nested refs', () => {
    const store = createLayoutStore();
    store.set('inner', { component: 'Text', props: { value: 'hi' } });
    store.set('outer', { component: 'Stack', children: [{ ref: 'inner' }] });
    const layout = store.resolveReferences({ ref: 'outer' });
    expect(layout).toEqual({
      component: 'Stack',
      children: [{ component: 'Text', props: { value: 'hi' } }],
    });
  });

  it('resolveReferences leaves unknown refs in place', () => {
    const store = createLayoutStore();
    expect(store.resolveReferences({ ref: 'missing' })).toEqual({ ref: 'missing' });
  });

  it('resolveReferences walks conditional and loop branches', () => {
    const store = createLayoutStore();
    store.set('a', 'A');
    store.set('b', 'B');
    const out = store.resolveReferences({
      if: '$.x',
      then: { ref: 'a' },
      else: { ref: 'b' },
    });
    expect(out).toEqual({ if: '$.x', then: 'A', else: 'B' });

    const loopOut = store.resolveReferences({ for: '$.xs', as: 'x', do: { ref: 'a' } });
    expect(loopOut).toEqual({ for: '$.xs', as: 'x', do: 'A' });
  });
});
