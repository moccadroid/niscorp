import { describe, it, expect } from 'vitest';
import { collectInteractive } from '../../src/agent/affordances';

// The affordance walker derives a layout's interactive surface from the tree
// itself — refs, *Ref props, models, bound keys — so a director can wire
// triggers against a layout it never sees, and nothing is self-reported.

describe('collectInteractive', () => {
  it('collects node refs with their component', () => {
    const layout = {
      component: 'Stack',
      children: [
        { component: 'Button', ref: 'increment', children: '+1' },
        { component: 'Text', children: '{{$.count}}' },
      ],
    };

    const surface = collectInteractive(layout);
    expect(surface.refs).toEqual([{ ref: 'increment', component: 'Button', via: 'ref' }]);
    expect(surface.boundKeys).toEqual(['count']);
    expect(surface.componentCount).toBe(3);
  });

  it('collects *Ref props (component-specific event sources)', () => {
    const layout = {
      component: 'Table',
      ref: 'row',
      props: { rows: '$.rows', sortRef: 'sort', clickKey: 'deal_id' },
    };

    const surface = collectInteractive(layout);
    expect(surface.refs).toContainEqual({ ref: 'row', component: 'Table', via: 'ref' });
    expect(surface.refs).toContainEqual({ ref: 'sort', component: 'Table', via: 'sortRef' });
    expect(surface.boundKeys).toEqual(['rows']);
  });

  it('collects models as input bindings', () => {
    const layout = {
      component: 'Stack',
      children: [{ component: 'Input', ref: 'search', model: '$.search' }],
    };

    const surface = collectInteractive(layout);
    expect(surface.models).toEqual([{ path: '$.search', component: 'Input' }]);
    expect(surface.boundKeys).toEqual(['search']);
  });

  it('reaches refs and bindings inside directives (if / for)', () => {
    const layout = {
      component: 'Stack',
      children: [
        {
          if: '$.menuOpenId',
          then: { component: 'Button', ref: 'menu-close', children: 'Close' },
        },
        {
          for: '$.rows',
          as: 'row',
          do: { component: 'Chip', ref: 'pick', children: '{{$row.name}}' },
        },
      ],
    };

    const surface = collectInteractive(layout);
    expect(surface.refs.map((r) => r.ref).sort()).toEqual(['menu-close', 'pick']);
    // `$row.name` is loop-local, not a data key; `$.menuOpenId` / `$.rows` are.
    expect(surface.boundKeys).toEqual(['menuOpenId', 'rows']);
  });

  it('an empty or non-interactive layout yields an empty surface', () => {
    const surface = collectInteractive({ component: 'Text', children: 'static' });
    expect(surface.refs).toEqual([]);
    expect(surface.models).toEqual([]);
    expect(surface.boundKeys).toEqual([]);
    expect(surface.suspectBindings).toEqual([]);
  });

  it('flags $name bindings outside a loop, accepts declared loop variables', () => {
    const layout = {
      component: 'Stack',
      children: [
        { component: 'Text', children: '{{$kpi.overdueCount}}' },
        {
          for: '$.rows',
          as: 'row',
          do: { component: 'Text', children: '{{$row.title}} — {{$other.x}}' },
        },
      ],
    };
    const surface = collectInteractive(layout);
    expect(surface.suspectBindings).toEqual(['$kpi.', '$other.']);
    expect(surface.boundKeys).toEqual(['rows']);
  });
});
