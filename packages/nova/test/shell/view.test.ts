import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry } from '@layout';
import { createShell, shellSettled, shellView } from '@shell';
import type { Shell } from '@shell';

// A shell as something an adapter draws, and the moment its first screen is whole.

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const counter: ActionDefinition = {
  id: 'counter',
  data: { n: 0 },
  layout: { component: 'Button', ref: 'bump', children: '$.n' },
  triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
};

const names = (): ReturnType<typeof createComponentRegistry> => {
  const registry = createComponentRegistry();
  for (const name of ['CanvasSlot', 'ActionSlot', 'Stack', 'Box', 'Button', 'Text']) registry.register(name, {});
  return registry;
};

const shellOf = (extra: Partial<Parameters<typeof createShell>[0]> = {}): Shell =>
  createShell({ registry: names(), canvases: [{ id: 'main', initial: 'counter' }, { id: 'side' }], actions: { counter }, ...extra });

describe('shellView — a shell, as a RenderApi', () => {
  it('reads the frame and each canvas as the shell holds them', () => {
    const shell = shellOf();
    const { api } = shellView(shell);
    expect(api.frame()).toEqual(shell.getShellRenderTree());
    expect(api.canvasTree('main')).toEqual(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
    // nothing mounted is nothing to see — an empty tree, as it is over the wire
    expect(api.canvasTree('side')).toEqual([]);
  });

  it('an event that names no origin goes to the canvas’s active instance', async () => {
    const shell = shellOf();
    const { api } = shellView(shell);
    api.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    const active = shell.getState().canvases['main']?.active?.id ?? '';
    expect(shell.getRuntime(active)?.getData()['n']).toBe(1);
  });

  it('an event that names its own origin keeps it', async () => {
    const shell = shellOf();
    shell.push('side', 'counter');
    const [main, side] = [shell.getState().canvases['main']?.active?.id ?? '', shell.getState().canvases['side']?.active?.id ?? ''];
    // dispatched "from" main, but stamped for the instance on side
    shellView(shell).api.dispatch('main', { type: 'ui:click', ref: 'bump', origin: side });
    await tick();
    expect(shell.getRuntime(main)?.getData()['n']).toBe(0);
    expect(shell.getRuntime(side)?.getData()['n']).toBe(1);
  });

  it('tells its subscriber once for a burst of changes, and not at all after it leaves', async () => {
    const shell = shellOf();
    const view = shellView(shell);
    let told = 0;
    const stop = view.subscribe(() => (told += 1));
    view.api.dispatch('main', { type: 'ui:click', ref: 'bump' });
    view.api.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick(5);
    expect(told).toBeGreaterThan(0);
    expect(told).toBeLessThan(4);
    const seen = told;
    stop();
    view.api.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick(5);
    expect(told).toBe(seen);
  });
});

describe('shellSettled — the first screen is whole', () => {
  const loader = (delayMs: number): { shell: Shell } => {
    const list: ActionDefinition = {
      id: 'list',
      data: { rows: [], loading: true },
      endpoints: { load: { url: '/rows', method: 'GET', target: 'rows' } },
      lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
      layout: { component: 'Text', children: '$.loading' },
    };
    const shell = createShell({
      registry: names(),
      canvases: [{ id: 'main', initial: 'list' }],
      actions: { list },
      fetch: async () => {
        await tick(delayMs);
        return { ok: true, status: 200, json: async () => [{ id: 1 }], text: async () => '[]' };
      },
    });
    return { shell };
  };
  const loading = (shell: Shell): unknown => shell.getRuntime(shell.getState().canvases['main']?.active?.id ?? '')?.getData()['loading'];

  it('waits for the mount’s loads, and what they chain to', async () => {
    const { shell } = loader(20);
    expect(loading(shell)).toBe(true);
    expect(await shellSettled(shell)).toBe(true);
    expect(loading(shell)).toBe(false);
  });

  it('a shell with nothing to load is whole at once', async () => {
    expect(await shellSettled(shellOf())).toBe(true);
  });

  it('past the wait it answers false, and the screen is as it stood', async () => {
    const { shell } = loader(120);
    expect(await shellSettled(shell, { waitMs: 10 })).toBe(false);
    expect(loading(shell)).toBe(true);
  });
});
