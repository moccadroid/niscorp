// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell, type Shell } from '@shell';
import type { NovaComponent } from '@react';
import { NovaShellProvider, useShellState } from '@react';

// ═══════════════════════════════════════════════════════════
// Shell-swap and provider-lifecycle tests.
//
// Contracts verified:
//   1. Changing the `shell` prop on <NovaShellProvider> causes
//      hooks to resubscribe to the new shell.
//   2. Unmounting the provider stops subscriptions cleanly.
//   3. The provider NEVER calls shell.dispose() — the consumer
//      owns the shell's lifecycle.
// ═══════════════════════════════════════════════════════════

type Rig = {
  shell: Shell;
  registry: ReturnType<typeof createComponentRegistry<NovaComponent>>;
};

const makeRig = (actionId: string): Rig => {
  const registry = createComponentRegistry<NovaComponent>();
  const def: ActionDefinition = { id: actionId, data: {} };
  const shell = createShell({
    canvases: ['main'],
    registry,
    layoutStore: createLayoutStore(),
    actions: { [actionId]: def },
  });
  return { shell, registry };
};

const ActiveIdProbe = (): React.ReactElement => {
  const state = useShellState();
  const active = state.canvases['main']?.active?.definitionId ?? 'none';
  return <div data-testid="active">{active}</div>;
};

describe('<NovaShellProvider> shell-swap and lifecycle', () => {
  it('resubscribes when the shell prop changes', async () => {
    const rigA = makeRig('foo');
    const rigB = makeRig('bar');

    const { rerender } = render(
      <NovaShellProvider shell={rigA.shell} registry={rigA.registry}>
        <ActiveIdProbe />
      </NovaShellProvider>,
    );

    await act(async () => {
      rigA.shell.push('main', 'foo');
      await Promise.resolve();
    });
    expect(screen.getByTestId('active').textContent).toBe('foo');

    rerender(
      <NovaShellProvider shell={rigB.shell} registry={rigB.registry}>
        <ActiveIdProbe />
      </NovaShellProvider>,
    );

    await act(async () => {
      rigB.shell.push('main', 'bar');
      await Promise.resolve();
    });
    expect(screen.getByTestId('active').textContent).toBe('bar');

    // Changes on the old shell must NOT affect the rendered DOM.
    await act(async () => {
      rigA.shell.push('main', 'foo');
      await Promise.resolve();
    });
    expect(screen.getByTestId('active').textContent).toBe('bar');

    rigA.shell.dispose();
    rigB.shell.dispose();
  });

  it('unmount stops subscriptions without errors or stray callbacks', async () => {
    const rig = makeRig('foo');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(
      <NovaShellProvider shell={rig.shell} registry={rig.registry}>
        <ActiveIdProbe />
      </NovaShellProvider>,
    );

    await act(async () => {
      rig.shell.push('main', 'foo');
      await Promise.resolve();
    });
    expect(screen.getByTestId('active').textContent).toBe('foo');

    unmount();

    // After unmount, the still-alive shell must remain functional
    // and driving it must not throw or log errors.
    expect(() => rig.shell.push('main', 'foo')).not.toThrow();
    expect(rig.shell.getCanvasState('main').stack.length).toBeGreaterThan(0);

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    rig.shell.dispose();
  });

  it('does NOT call shell.dispose() on unmount or on shell-swap', async () => {
    const rigA = makeRig('foo');
    const rigB = makeRig('bar');
    const disposeA = vi.spyOn(rigA.shell, 'dispose');
    const disposeB = vi.spyOn(rigB.shell, 'dispose');

    const { rerender, unmount } = render(
      <NovaShellProvider shell={rigA.shell} registry={rigA.registry}>
        <ActiveIdProbe />
      </NovaShellProvider>,
    );

    rerender(
      <NovaShellProvider shell={rigB.shell} registry={rigB.registry}>
        <ActiveIdProbe />
      </NovaShellProvider>,
    );

    unmount();

    expect(disposeA).not.toHaveBeenCalled();
    expect(disposeB).not.toHaveBeenCalled();

    // The original shells remain fully usable.
    await act(async () => {
      rigA.shell.push('main', 'foo');
      rigB.shell.push('main', 'bar');
      await Promise.resolve();
    });
    expect(rigA.shell.getCanvasState('main').stack.length).toBeGreaterThan(0);
    expect(rigB.shell.getCanvasState('main').stack.length).toBeGreaterThan(0);

    disposeA.mockRestore();
    disposeB.mockRestore();
    rigA.shell.dispose();
    rigB.shell.dispose();
  });
});
