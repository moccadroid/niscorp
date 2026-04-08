// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createComponentRegistry } from '@layout';
import type { NovaComponent } from '@react';
import {
  NovaRenderProvider,
  RenderTree,
  useNovaDispatch,
  useNovaPublish,
} from '@react';

const TextBox: NovaComponent = ({ children }) => <div data-testid="tb">{children}</div>;

describe('<NovaRenderProvider>', () => {
  it('renders a component from the registry without a shell', () => {
    const registry = createComponentRegistry<NovaComponent>();
    registry.register('TextBox', TextBox);
    render(
      <NovaRenderProvider registry={registry} dispatch={() => {}} publish={() => {}}>
        <RenderTree
          nodes={[
            {
              type: 'component',
              name: 'TextBox',
              props: {},
              children: [{ type: 'text', value: 'hello' }],
            },
          ]}
        />
      </NovaRenderProvider>,
    );
    expect(screen.getByTestId('tb').textContent).toBe('hello');
  });

  it('renders COMPONENT_NOT_FOUND for missing component', () => {
    const registry = createComponentRegistry<NovaComponent>();
    render(
      <NovaRenderProvider registry={registry} dispatch={() => {}} publish={() => {}}>
        <RenderTree
          nodes={[{ type: 'component', name: 'Missing', props: {}, children: [] }]}
        />
      </NovaRenderProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain('COMPONENT_NOT_FOUND');
  });

  it('useNovaDispatch + useNovaPublish expose context fns', () => {
    const registry = createComponentRegistry<NovaComponent>();
    const dispatch = vi.fn();
    const publish = vi.fn();
    const Probe: NovaComponent = () => {
      const d = useNovaDispatch();
      const p = useNovaPublish();
      return (
        <button
          type="button"
          onClick={() => {
            d({ type: 'ui:click', ref: 'x' });
            p('chan', { a: 1 });
          }}
        >
          go
        </button>
      );
    };
    registry.register('Probe', Probe);
    render(
      <NovaRenderProvider registry={registry} dispatch={dispatch} publish={publish}>
        <RenderTree
          nodes={[{ type: 'component', name: 'Probe', props: {}, children: [] }]}
        />
      </NovaRenderProvider>,
    );
    screen.getByRole('button').click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'x' });
    expect(publish).toHaveBeenCalledWith('chan', { a: 1 });
  });

  it('useNovaDispatch throws outside provider', () => {
    const Probe: NovaComponent = () => {
      useNovaDispatch();
      return null;
    };
    // Suppress React error logging noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/NovaRenderProvider/);
    spy.mockRestore();
  });
});
