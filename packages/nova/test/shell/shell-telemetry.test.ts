import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';
import type { ShellDataChangeEvent, StateSnapshot } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const A: ActionDefinition = { id: 'A', data: { n: 0 } };
const B: ActionDefinition = { id: 'B', data: {} };

describe('shell — telemetry', () => {
  it('onStateChange fires on push/pop/replace/clear', async () => {
    const states: StateSnapshot[] = [];
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A, B },
      telemetry: { onStateChange: (s) => states.push(s) },
    });
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.pop('main');
    shell.replace('main', 'B');
    shell.clear('main');
    await tick();
    expect(states.length).toBeGreaterThanOrEqual(5);
  });

  it('onDataChange fires when action data changes', async () => {
    const events: ShellDataChangeEvent[] = [];
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A },
      telemetry: { onDataChange: (e) => events.push(e) },
    });
    const id = shell.push('main', 'A');
    await tick();
    const r = getInternalRuntime(shell, id);
    if (r === undefined) throw new Error('no runtime');
    r.applyMutations([{ increment: 'n' }]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1];
    expect(last?.instanceId).toBe(id);
    expect(last?.canvasId).toBe('main');
  });

  it('subscribed handlers stop after dispose', async () => {
    const events: ShellDataChangeEvent[] = [];
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A },
    });
    shell.onDataChange((e) => events.push(e));
    const id = shell.push('main', 'A');
    await tick();
    const r = getInternalRuntime(shell, id);
    if (r === undefined) throw new Error('no runtime');
    r.applyMutations([{ increment: 'n' }]);
    const before = events.length;
    shell.dispose();
    expect(events.length).toBe(before);
  });
});
