import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell, navigatedChannel } from '@shell';
import type { NavigatedMessage, ShellConfig } from '@shell';
import { createMessageBus } from '@shared/message-bus';

// ═══════════════════════════════════════════════════════════
// A canvas says where it is. What chrome around a canvas — a sidebar
// highlight, a tab strip — listens to instead of remembering the click that
// sent somebody somewhere.
// ═══════════════════════════════════════════════════════════

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const A: ActionDefinition = { id: 'A', data: {} };
const B: ActionDefinition = { id: 'B', data: {} };
const C: ActionDefinition = { id: 'C', data: {} };

// Every shell here shares one bus so a test can listen without holding the
// shell — which is what a chrome ACTION does, one canvas over.
const setup = (config: Partial<ShellConfig> = {}) => {
  const messageBus = createMessageBus();
  const heard: NavigatedMessage[] = [];
  messageBus.subscribe(navigatedChannel('main'), (payload) => void heard.push(payload as NavigatedMessage));
  const shell = createShell({
    canvases: [{ id: 'main' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { A, B, C },
    messageBus,
    ...config,
  });
  return { shell, heard, messageBus };
};

describe('a canvas announces where it is', () => {
  it('names the channel after the canvas, so a listener never filters', async () => {
    const { shell, messageBus } = setup({ canvases: [{ id: 'main' }, { id: 'sheet' }] });
    const mainHeard: NavigatedMessage[] = [];
    const sheetHeard: NavigatedMessage[] = [];
    messageBus.subscribe(navigatedChannel('sheet'), (p) => void sheetHeard.push(p as NavigatedMessage));
    messageBus.subscribe(navigatedChannel('main'), (p) => void mainHeard.push(p as NavigatedMessage));

    shell.push('sheet', 'B');
    await tick();

    expect(sheetHeard).toHaveLength(1);
    expect(mainHeard).toHaveLength(0);
  });

  it('carries the action and instance now standing', async () => {
    const { shell, heard } = setup();
    const id = shell.push('main', 'A');
    await tick();
    expect(heard).toEqual([{ canvas: 'main', action: 'A', instance: id }]);
  });

  it('says so when a canvas goes empty', async () => {
    const { shell, heard } = setup();
    shell.push('main', 'A');
    await tick();
    heard.length = 0;

    shell.clear('main');
    await tick();

    expect(heard).toEqual([{ canvas: 'main' }]);
  });

  it('announces the seeded landing screen', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    await tick();
    expect(heard).toHaveLength(1);
    expect(heard[0]?.action).toBe('A');
    expect(shell.getCanvasState('main').stack).toHaveLength(1);
  });

  it('says nothing about a canvas nothing was ever on', async () => {
    const { heard } = setup();
    await tick();
    expect(heard).toEqual([]);
  });
});

describe('a canvas announces where it ENDED, once', () => {
  it('collapses a burst into the final position', async () => {
    const { shell, heard } = setup();
    shell.push('main', 'A');
    shell.push('main', 'B');
    shell.push('main', 'C');
    await tick();

    // Three pushes, one message: the message is state, not history.
    expect(heard).toHaveLength(1);
    expect(heard[0]?.action).toBe('C');
  });

  it('a resetTo is one move, not a clear and a push', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    await tick();
    heard.length = 0;

    shell.clear('main');
    shell.push('main', 'B');
    await tick();

    // Never "the canvas is empty" on the way to somewhere.
    expect(heard).toEqual([{ canvas: 'main', action: 'B', instance: shell.getCanvasState('main').active?.id }]);
  });

  it('stays quiet when the active screen did not change', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }, { id: 'sheet' }] });
    await tick();
    heard.length = 0;

    // A card opening on another canvas moves nothing on main.
    shell.push('sheet', 'B');
    await tick();

    expect(heard).toEqual([]);
  });
});

describe('a canvas announces every cause, not just a click', () => {
  it('back is announced like any other move', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    shell.push('main', 'B');
    await tick();
    heard.length = 0;

    shell.back();
    await tick();

    // The whole point: nothing clicked, and the chrome still hears it.
    expect(heard).toHaveLength(1);
    expect(heard[0]?.action).toBe('A');
  });

  it('a replace is announced', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    await tick();
    heard.length = 0;

    shell.replace('main', 'B');
    await tick();

    expect(heard[0]?.action).toBe('B');
  });

  it('a revoked action unmounting is announced', async () => {
    const { shell, heard } = setup({ canvases: [{ id: 'main', initial: 'A' }] });
    shell.push('main', 'B');
    await tick();
    heard.length = 0;

    shell.removeAction('B');
    await tick();

    expect(heard[0]?.action).toBe('A');
  });

  it('a canvas re-added under the same id starts fresh', async () => {
    const { shell, heard, messageBus } = setup({ canvases: [{ id: 'main' }] });
    const asideHeard: NavigatedMessage[] = [];
    messageBus.subscribe(navigatedChannel('aside'), (p) => void asideHeard.push(p as NavigatedMessage));

    shell.addCanvas({ id: 'aside', initial: 'A' });
    await tick();
    shell.removeCanvas('aside');
    await tick();
    asideHeard.length = 0;

    shell.addCanvas({ id: 'aside', initial: 'A' });
    await tick();

    expect(asideHeard).toHaveLength(1);
    expect(heard).toEqual([]);
  });
});
