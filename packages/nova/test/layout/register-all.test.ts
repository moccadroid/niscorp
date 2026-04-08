import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createComponentRegistry, type ComponentMeta } from '@layout';

// A tiny component surrogate. We don't care that it's actually a
// React element — the registry is framework-agnostic.
type FakeComponent = ((props: Record<string, unknown>) => null) & {
  meta?: ComponentMeta;
};

const makeComponent = (meta?: ComponentMeta): FakeComponent => {
  const fn: FakeComponent = () => null;
  if (meta !== undefined) fn.meta = meta;
  return fn;
};

describe('registerAll', () => {
  it('registers bare components with empty meta', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const A = makeComponent();
    const B = makeComponent();
    reg.registerAll({ A, B });
    expect(reg.list().sort()).toEqual(['A', 'B']);
    expect(reg.get('A')?.meta).toEqual({});
    expect(reg.get('B')?.meta).toEqual({});
  });

  it('preserves explicit meta from {component, meta} entries', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const schema = z.object({ label: z.string() });
    reg.registerAll({
      Button: {
        component: makeComponent(),
        meta: { description: 'A button', propsSchema: schema },
      },
    });
    const entry = reg.get('Button');
    expect(entry?.meta.description).toBe('A button');
    expect(entry?.meta.propsSchema).toBe(schema);
  });

  it('picks up static .meta on a component', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const schema = z.object({ value: z.number() });
    const Slider = makeComponent({ description: 'A slider', propsSchema: schema });
    reg.registerAll({ Slider });
    const entry = reg.get('Slider');
    expect(entry?.meta.description).toBe('A slider');
    expect(entry?.meta.propsSchema).toBe(schema);
  });

  it('explicit meta overrides static meta', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const Comp = makeComponent({ description: 'static' });
    reg.registerAll({
      Comp: { component: Comp, meta: { description: 'explicit' } },
    });
    expect(reg.get('Comp')?.meta.description).toBe('explicit');
  });

  it('handles a mixed batch of bare, entry, and static-meta components', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const Bare = makeComponent();
    const WithStatic = makeComponent({ description: 'static-desc' });
    const Explicit = makeComponent();
    reg.registerAll({
      Bare,
      WithStatic,
      Explicit: { component: Explicit, meta: { description: 'explicit-desc' } },
    });
    expect(reg.list().sort()).toEqual(['Bare', 'Explicit', 'WithStatic']);
    expect(reg.get('Bare')?.meta).toEqual({});
    expect(reg.get('WithStatic')?.meta.description).toBe('static-desc');
    expect(reg.get('Explicit')?.meta.description).toBe('explicit-desc');
  });

  it('empty record is a no-op', () => {
    const reg = createComponentRegistry<FakeComponent>();
    reg.registerAll({});
    expect(reg.list()).toEqual([]);
  });

  it('list() reflects all registered names after registerAll', () => {
    const reg = createComponentRegistry<FakeComponent>();
    reg.registerAll({ X: makeComponent(), Y: makeComponent(), Z: makeComponent() });
    expect(reg.list().sort()).toEqual(['X', 'Y', 'Z']);
  });

  it('register() also picks up static meta and lets explicit override', () => {
    const reg = createComponentRegistry<FakeComponent>();
    const Comp = makeComponent({ description: 'static' });
    reg.register('A', Comp);
    expect(reg.get('A')?.meta.description).toBe('static');
    reg.register('B', Comp, { description: 'explicit' });
    expect(reg.get('B')?.meta.description).toBe('explicit');
  });
});
