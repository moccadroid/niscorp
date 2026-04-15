import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('shell — integration', () => {
  it('end-to-end: register actions, drive a flow, verify push lands and data propagates', async () => {
    const registry = createPermissiveRegistry();
    registry.register('Text', () => null);
    registry.register('Button', () => null);
    const layoutStore = createLayoutStore();

    const Home: ActionDefinition = {
      id: 'Home',
      data: { count: 0 },
      layout: {
        component: 'Text',
        props: { value: '$.count' },
      },
      triggers: [
        { event: 'ui:click', ref: 'inc', do: [{ increment: 'count' }] },
        { event: 'ui:click', ref: 'go', do: [{ push: { action: 'Detail', input: { from: 'home' } } }] },
      ],
    };
    const Detail: ActionDefinition = {
      id: 'Detail',
      data: { from: 'unknown' },
      layout: { component: 'Text', props: { value: '$.from' } },
      triggers: [{ event: 'ui:click', ref: 'back', do: [{ pop: true }] }],
    };

    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry,
      layoutStore,
      actions: { Home, Detail },
    });

    const homeId = shell.push('main', 'Home');
    await tick();
    const home = getInternalRuntime(shell, homeId);
    if (home === undefined) throw new Error('no home');

    // Drive an "inc" trigger via executeSteps to mimic a UI click. We
    // exercise the trigger steps path through the runtime.
    await home.executeSteps([{ increment: 'count' }]);
    expect(home.getData()).toMatchObject({ count: 1 });
    expect(shell.getCanvasState('main').active?.data).toMatchObject({ count: 1 });

    // Push to detail with input
    await home.executeSteps([{ push: { action: 'Detail', input: { from: 'home' } } }]);
    await tick();
    const top = shell.getCanvasState('main').active;
    expect(top?.definitionId).toBe('Detail');
    expect(top?.data).toMatchObject({ from: 'home' });

    // Pop back
    if (top === undefined) throw new Error('no top');
    const detail = getInternalRuntime(shell, top.id);
    if (detail === undefined) throw new Error('no detail');
    await detail.executeSteps([{ pop: true }]);
    await tick();
    expect(shell.getCanvasState('main').active?.definitionId).toBe('Home');
    expect(shell.getCanvasState('main').stack).toHaveLength(1);
  });
});
