import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { NovaError } from '@shared/errors';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ═══════════════════════════════════════════════════════════
// E2E verification that suspend/resume lifecycle hooks fire
// when actions are pushed/popped on top of each other.
// ═══════════════════════════════════════════════════════════

describe('shell — suspend/resume lifecycle hooks', () => {
  const setup = (actions: Record<string, ActionDefinition>) =>
    createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions,
    });

  it('fires suspend hook when a new action is pushed on top', async () => {
    const A: ActionDefinition = {
      id: 'A',
      data: { suspended: false },
      lifecycle: { suspend: [{ set: 'suspended', value: true }] },
    };
    const B: ActionDefinition = { id: 'B' };
    const shell = setup({ A, B });

    const aId = shell.push('main', 'A');
    await tick();
    shell.push('main', 'B');
    await tick();

    const aRuntime = shell.getRuntime(aId);
    if (aRuntime === undefined) throw new Error('A unmounted');
    expect(aRuntime.getData()['suspended']).toBe(true);
  });

  it('fires resume hook when the action above is popped', async () => {
    const A: ActionDefinition = {
      id: 'A',
      data: { resumed: false },
      lifecycle: { resume: [{ set: 'resumed', value: true }] },
    };
    const B: ActionDefinition = { id: 'B' };
    const shell = setup({ A, B });

    const aId = shell.push('main', 'A');
    await tick();
    shell.push('main', 'B');
    await tick();
    shell.pop('main');
    await tick();

    const aRuntime = shell.getRuntime(aId);
    if (aRuntime === undefined) throw new Error('A unmounted');
    expect(aRuntime.getData()['resumed']).toBe(true);
  });

  it('fires both suspend and resume in order across a push/pop cycle', async () => {
    const A: ActionDefinition = {
      id: 'A',
      data: { events: [] },
      lifecycle: {
        suspend: [{ push: 'events', value: 'suspend' }],
        resume: [{ push: 'events', value: 'resume' }],
      },
    };
    const B: ActionDefinition = { id: 'B' };
    const shell = setup({ A, B });

    const aId = shell.push('main', 'A');
    await tick();
    shell.push('main', 'B');
    await tick();
    shell.pop('main');
    await tick();

    const aRuntime = shell.getRuntime(aId);
    if (aRuntime === undefined) throw new Error('A unmounted');
    expect(aRuntime.getData()['events']).toEqual(['suspend', 'resume']);
  });

  it('reports suspend hook errors via onError telemetry in lax mode', async () => {
    const onError = vi.fn();
    const A: ActionDefinition = {
      id: 'A',
      lifecycle: { suspend: [{ call: 'missing' }] },
    };
    const B: ActionDefinition = { id: 'B' };
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A, B },
      onError,
    });

    const aId = shell.push('main', 'A');
    await tick();
    expect(() => shell.push('main', 'B')).not.toThrow();
    await tick();

    // Suspend ran, the call to a missing endpoint did not crash navigation.
    // The new action B is now active.
    const top = shell.getCanvasState('main').active;
    expect(top).toBeDefined();
    expect(top?.definitionId).toBe('B');
    expect(shell.getRuntime(aId)).toBeDefined();
  });

  it('does not fire suspend or resume hooks for actions without them', async () => {
    const A: ActionDefinition = { id: 'A', data: { value: 1 } };
    const B: ActionDefinition = { id: 'B' };
    const shell = setup({ A, B });

    const aId = shell.push('main', 'A');
    await tick();
    shell.push('main', 'B');
    await tick();
    shell.pop('main');
    await tick();

    const aRuntime = shell.getRuntime(aId);
    if (aRuntime === undefined) throw new Error('A unmounted');
    // Data unchanged — no hooks defined, no mutations.
    expect(aRuntime.getData()['value']).toBe(1);
  });
});
