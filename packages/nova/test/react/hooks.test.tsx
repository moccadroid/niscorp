// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { NovaComponent } from '@react';
import {
  NovaShellProvider,
  useActionData,
  useActionStatus,
  useCanvas,
  useShell,
  useShellState,
} from '@react';

const mkShell = () => {
  const registry = createComponentRegistry<NovaComponent>();
  const def: ActionDefinition = { id: 'A', data: { count: 7 } };
  const shell = createShell({
    canvases: ['main'],
    registry,
    layoutStore: createLayoutStore(),
    actions: { A: def },
  });
  return { shell, registry };
};

const Wrap = ({ children }: { children: React.ReactNode }) => {
  const { shell, registry } = mkShell();
  return (
    <NovaShellProvider shell={shell} registry={registry}>
      {children}
    </NovaShellProvider>
  );
};

describe('React hooks', () => {
  it('useShell throws outside provider', () => {
    const Probe = () => {
      useShell();
      return null;
    };
    expect(() => render(<Probe />)).toThrow(/NovaShellProvider/);
  });

  it('useShellState returns snapshot with declared canvases', () => {
    const Probe = () => {
      const state = useShellState();
      return <div data-testid="out">{Object.keys(state.canvases).join(',')}</div>;
    };
    render(
      <Wrap>
        <Probe />
      </Wrap>,
    );
    expect(screen.getByTestId('out').textContent).toBe('main');
  });

  it('useCanvas, useActionData, useActionStatus report an active instance', async () => {
    const registry = createComponentRegistry<NovaComponent>();
    const def: ActionDefinition = { id: 'A', data: { count: 7 } };
    const shell = createShell({
      canvases: ['main'],
      registry,
      layoutStore: createLayoutStore(),
      actions: { A: def },
    });
    const id = shell.push('main', 'A');
    await act(async () => {
      await Promise.resolve();
    });

    const Probe = () => {
      const canvas = useCanvas('main');
      const data = useActionData(id);
      const status = useActionStatus(id);
      return (
        <div>
          <span data-testid="stack">{canvas.stack.length}</span>
          <span data-testid="count">{String(data?.['count'] ?? 'none')}</span>
          <span data-testid="status">{status ?? 'none'}</span>
        </div>
      );
    };

    render(
      <NovaShellProvider shell={shell} registry={registry}>
        <Probe />
      </NovaShellProvider>,
    );

    expect(screen.getByTestId('stack').textContent).toBe('1');
    expect(screen.getByTestId('count').textContent).toBe('7');
    expect(screen.getByTestId('status').textContent).toBe('active');

    shell.dispose();
  });
});
