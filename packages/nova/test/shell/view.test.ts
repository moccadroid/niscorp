import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry } from '@layout';
import { createShell, shellIdle, shellSettled, shellView } from '@shell';
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

describe('shellIdle — nothing the shell started is still running', () => {
  // One page: a mount that loads, a press that calls, a press that announces
  // (and a listener that calls on hearing it), a press that follows a read, and
  // a press that opens a cover whose own press closes it again.
  const page: ActionDefinition = {
    id: 'page',
    data: { answer: 'not yet', rows: 'not yet', heard: 'not yet', live: 'not yet' },
    endpoints: {
      ask: { fn: 'ask', target: 'answer' },
      load: { fn: 'load', target: 'rows' },
      hear: { fn: 'ask', target: 'heard' },
      watch: { url: '/live', method: 'GET', target: 'live' },
    },
    lifecycle: { mount: [{ call: 'load' }] },
    layout: { component: 'Button', ref: 'ask', children: '$.answer' },
    triggers: [
      { event: 'ui:click', ref: 'ask', do: [{ call: 'ask' }] },
      { event: 'ui:click', ref: 'say', do: [{ emit: { channel: 'said' } }] },
      { message: 'said', do: [{ call: 'hear' }] },
      { event: 'ui:click', ref: 'watch', do: [{ call: 'watch' }] },
      { event: 'ui:click', ref: 'open', do: [{ push: { action: 'cover' } }] },
    ],
  };
  const cover: ActionDefinition = {
    id: 'cover',
    data: {},
    layout: { component: 'Button', ref: 'close', children: 'close' },
    triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
  };

  type Functions = NonNullable<Parameters<typeof createShell>[0]['functions']>;
  const slow = (answer: string) => async (): Promise<string> => {
    await tick(20);
    return answer;
  };
  const pageShell = (functions: Functions, extra: Partial<Parameters<typeof createShell>[0]> = {}): Shell =>
    createShell({ registry: names(), canvases: [{ id: 'main', initial: 'page' }], actions: { page, cover }, functions, ...extra });
  const top = (shell: Shell): string => shell.getState().canvases['main']?.active?.id ?? '';
  const press = (shell: Shell, ref: string): void => shell.dispatch({ type: 'ui:click', ref, origin: top(shell) });
  const held = (shell: Shell, instance: string, key: string): unknown => shell.getRuntime(instance)?.getData()[key];

  it('waits for the call a press made — which shellSettled, asked about mounts, does not', async () => {
    // answered by hand, so nothing here depends on how long a timer takes
    let answer: (value: string) => void = () => undefined;
    const shell = pageShell({ ask: () => new Promise<string>((resolve) => (answer = resolve)), load: async () => 'loaded' });
    await shellSettled(shell);
    const id = top(shell);

    press(shell, 'ask');
    // the first screen is as whole as it was: a page read now must not wait on the call
    expect(await shellSettled(shell, { waitMs: 5000 })).toBe(true);
    expect(held(shell, id, 'answer')).toBe('not yet');

    const idle = shellIdle(shell, { waitMs: 5000 });
    await tick(30);
    answer('answered');
    expect(await idle).toBe(true);
    expect(held(shell, id, 'answer')).toBe('answered');
  });

  it('waits through an announcement to what its listener calls', async () => {
    const shell = pageShell({ ask: slow('answered'), load: async () => 'loaded' });
    await shellSettled(shell);
    const id = top(shell);

    press(shell, 'say');
    expect(await shellIdle(shell, { waitMs: 5000 })).toBe(true);
    expect(held(shell, id, 'heard')).toBe('answered');
  });

  it('waits for the re-read of an action a pop reveals', async () => {
    let loads = 0;
    const shell = pageShell({
      ask: async () => 'answered',
      load: async () => {
        loads += 1;
        await tick(20);
        return `loaded ${loads}`;
      },
    });
    await shellSettled(shell);
    const under = top(shell);
    expect(held(shell, under, 'rows')).toBe('loaded 1');

    press(shell, 'open');
    await shellIdle(shell);
    press(shell, 'close');
    expect(await shellIdle(shell, { waitMs: 5000 })).toBe(true);
    expect(held(shell, under, 'rows')).toBe('loaded 2');
  });

  it('covers a first screen whose mount announces and whose listener loads', async () => {
    const announcer: ActionDefinition = {
      id: 'announcer',
      data: {},
      layout: { component: 'Text', children: 'chrome' },
      lifecycle: { mount: [{ emit: { channel: 'ready' } }] },
    };
    const listener: ActionDefinition = {
      id: 'listener',
      data: { rows: 'not yet' },
      endpoints: { load: { fn: 'load', target: 'rows' } },
      layout: { component: 'Text', children: '$.rows' },
      triggers: [{ message: 'ready', do: [{ call: 'load' }] }],
    };
    const shell = createShell({
      registry: names(),
      canvases: [{ id: 'side', initial: 'listener' }, { id: 'main', initial: 'announcer' }],
      actions: { announcer, listener },
      functions: { load: slow('loaded') },
    });
    expect(await shellIdle(shell, { waitMs: 5000 })).toBe(true);
    expect(held(shell, shell.getState().canvases['side']?.active?.id ?? '', 'rows')).toBe('loaded');
  });

  it('a read the shell is following does not hold it, and its next body is not waited for', async () => {
    // What a reactive read is to a shell: an answer now, and a subscription
    // that stays open. The next body is somebody else's write, not this
    // shell's work.
    let tell: (body: unknown) => void = () => undefined;
    const shell = pageShell(
      { ask: async () => 'answered', load: async () => 'loaded' },
      {
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => 'first',
          text: async () => '"first"',
          onChange: (handler: (body: unknown) => void) => {
            tell = handler;
            return () => undefined;
          },
        }),
      },
    );
    await shellSettled(shell);
    const id = top(shell);

    press(shell, 'watch');
    expect(await shellIdle(shell, { waitMs: 5000 })).toBe(true);
    expect(held(shell, id, 'live')).toBe('first');

    // what does say so is the shell's own data telemetry
    let changes = 0;
    const stop = shell.onDataChange(() => (changes += 1));
    tell('second');
    expect(held(shell, id, 'live')).toBe('second');
    expect(changes).toBe(1);
    expect(await shellIdle(shell)).toBe(true);
    stop();
  });

  it('past the wait it answers false, with the call still out', async () => {
    const shell = pageShell({ ask: () => new Promise<string>(() => undefined), load: async () => 'loaded' });
    await shellSettled(shell);
    const id = top(shell);

    press(shell, 'ask');
    expect(await shellIdle(shell, { waitMs: 30 })).toBe(false);
    expect(held(shell, id, 'answer')).toBe('not yet');
    shell.dispose();
  });

  it('a shell with nothing running is idle at once', async () => {
    expect(await shellIdle(shellOf())).toBe(true);
  });
});
