// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { createComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import { NovaRenderProvider, RenderTree, useNovaRegistry } from '@react';

// A nova component with a static `.meta` — the registry picks it
// up when registering via `registerAll`.
const ButtonPropsSchema = z.object({ label: z.string() });
const Button: NovaComponent = (props) => {
  const label = typeof props['label'] === 'string' ? props['label'] : '';
  return <button type="button">{label}</button>;
};
Button.meta = {
  description: 'A clickable button',
  propsSchema: ButtonPropsSchema,
};

describe('NovaComponent static meta + registerAll', () => {
  it('registerAll preserves static .meta on components', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registry.registerAll({ Button });
    const entry = registry.get('Button');
    expect(entry?.meta.description).toBe('A clickable button');
    expect(entry?.meta.propsSchema).toBe(ButtonPropsSchema);
  });

  it('useNovaRegistry lets a child component look up another component meta', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registry.registerAll({ Button });

    const Inspector: NovaComponent = () => {
      const reg = useNovaRegistry();
      const entry = reg.get('Button');
      return <div data-testid="desc">{entry?.meta.description ?? 'missing'}</div>;
    };
    registry.register('Inspector', Inspector);

    render(
      <NovaRenderProvider registry={registry} dispatch={() => {}} publish={() => {}}>
        <RenderTree
          nodes={[{ type: 'component', name: 'Inspector', props: {}, children: [] }]}
        />
      </NovaRenderProvider>,
    );
    expect(screen.getByTestId('desc').textContent).toBe('A clickable button');
  });
});
