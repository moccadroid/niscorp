import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('shell — cross-canvas messaging via shared event bus', () => {
  it('action A emits, action B on a different canvas reacts via message trigger', async () => {
    const Emitter: ActionDefinition = {
      id: 'Emitter',
      data: {},
    };
    const Listener: ActionDefinition = {
      id: 'Listener',
      data: { count: 0 },
      triggers: [
        { message: 'cart-updated', do: [{ increment: 'count' }] },
      ],
    };

    const shell = createShell({
      canvases: ['main', 'side'],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { Emitter, Listener },
    });

    const emId = shell.push('main', 'Emitter');
    const lsId = shell.push('side', 'Listener');
    await tick();

    const em = getInternalRuntime(shell, emId);
    const ls = getInternalRuntime(shell, lsId);
    if (em === undefined || ls === undefined) throw new Error('missing runtime');

    await em.executeSteps([{ emit: { channel: 'cart-updated', payload: { id: 1 } } }]);
    await tick();

    expect(ls.getData()).toEqual({ count: 1 });
  });
});
