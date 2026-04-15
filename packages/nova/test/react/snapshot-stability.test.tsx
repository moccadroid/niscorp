// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { NovaComponent } from '@react';
import { NovaShellProvider, useCanvas, useRenderTree } from '@react';

// ═══════════════════════════════════════════════════════════
// These tests verify the snapshot caching contract of
// `useRenderTree` and `useCanvas`. The integration test passes
// transitively — broken caching loops forever — but this file
// verifies the contract directly.
// ═══════════════════════════════════════════════════════════

type Rig = {
  shell: ReturnType<typeof createShell>;
  registry: ReturnType<typeof createComponentRegistry<NovaComponent>>;
};

const makeRig = (): Rig => {
  const registry = createComponentRegistry<NovaComponent>();
  const Text: NovaComponent = () => null;
  registry.register('Text', Text);
  const Form: ActionDefinition = {
    id: 'Form',
    data: { name: 'initial' },
    layout: {
      component: 'Text',
      ref: 'name',
      model: '$.name',
      props: { value: '{{$.name}}' },
    },
  };
  const Other: ActionDefinition = {
    id: 'Other',
    data: { x: 1 },
    layout: { component: 'Text', props: {} },
  };
  const shell = createShell({
    canvases: [{ id: 'main' }],
    registry,
    layoutStore: createLayoutStore(),
    actions: { Form, Other },
  });
  return { shell, registry };
};

const makeWrapper = (rig: Rig) => {
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <NovaShellProvider shell={rig.shell} registry={rig.registry}>
      {children}
    </NovaShellProvider>
  );
  return Wrapper;
};

describe('useRenderTree snapshot stability', () => {
  it('returns the same reference across re-renders when data is unchanged', async () => {
    const rig = makeRig();
    const instanceId = rig.shell.push('main', 'Form');
    await act(async () => {
      await Promise.resolve();
    });

    const { result, rerender } = renderHook(() => useRenderTree(instanceId), {
      wrapper: makeWrapper(rig),
    });
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second).toBe(first);

    // Trigger a real data change via a dispatch that fires a trigger.
    await act(async () => {
      rig.shell.dispatch({ type: 'ui:model', ref: 'name', payload: 'ada' });
      await Promise.resolve();
    });
    const third = result.current;
    expect(third).not.toBe(first);

    rerender();
    const fourth = result.current;
    expect(fourth).toBe(third);

    rig.shell.dispose();
  });

  it('returns a stable EMPTY array for a missing instance', () => {
    const rig = makeRig();
    const { result, rerender } = renderHook(() => useRenderTree('nope'), {
      wrapper: makeWrapper(rig),
    });
    const first = result.current;
    expect(first).toEqual([]);
    rerender();
    expect(result.current).toBe(first);
    rig.shell.dispose();
  });
});

describe('useCanvas snapshot stability', () => {
  it('returns the same reference across re-renders when state is unchanged', async () => {
    const rig = makeRig();
    rig.shell.push('main', 'Form');
    await act(async () => {
      await Promise.resolve();
    });

    const { result, rerender } = renderHook(() => useCanvas('main'), {
      wrapper: makeWrapper(rig),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    await act(async () => {
      rig.shell.push('main', 'Other');
      await Promise.resolve();
    });
    const third = result.current;
    expect(third).not.toBe(first);

    rerender();
    expect(result.current).toBe(third);

    rig.shell.dispose();
  });

  it('returns a stable snapshot for an empty canvas', () => {
    const rig = makeRig();
    const { result, rerender } = renderHook(() => useCanvas('main'), {
      wrapper: makeWrapper(rig),
    });
    const first = result.current;
    expect(first.stack.length).toBe(0);
    rerender();
    expect(result.current).toBe(first);
    rig.shell.dispose();
  });
});

describe('React StrictMode compatibility', () => {
  it('does not break snapshot caches under StrictMode double-invocation', async () => {
    const rig = makeRig();
    const instanceId = rig.shell.push('main', 'Form');
    await act(async () => {
      await Promise.resolve();
    });

    const onStateChangeSpy = vi.spyOn(rig.shell, 'onStateChange');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Probe = (): React.ReactElement => {
      const tree = useRenderTree(instanceId);
      const canvas = useCanvas('main');
      return (
        <div>
          <span data-testid="tree-len">{tree.length}</span>
          <span data-testid="stack-len">{canvas.stack.length}</span>
        </div>
      );
    };

    render(
      <StrictMode>
        <NovaShellProvider shell={rig.shell} registry={rig.registry}>
          <Probe />
        </NovaShellProvider>
      </StrictMode>,
    );

    expect(screen.getByTestId('tree-len').textContent).toBe('1');
    expect(screen.getByTestId('stack-len').textContent).toBe('1');

    await act(async () => {
      rig.shell.dispatch({ type: 'ui:model', ref: 'name', payload: 'grace' });
      await Promise.resolve();
    });

    // Still one node; content just changed. The important bit is
    // that React did not throw a "snapshot returned different
    // values" warning (error spy with that specific message).
    expect(screen.getByTestId('tree-len').textContent).toBe('1');
    for (const call of error.mock.calls) {
      const first = call[0];
      if (typeof first === 'string') {
        expect(first).not.toMatch(/getSnapshot should be cached/i);
        expect(first).not.toMatch(/returned different values/i);
      }
    }

    warn.mockRestore();
    error.mockRestore();
    onStateChangeSpy.mockRestore();
    rig.shell.dispose();
  });
});
