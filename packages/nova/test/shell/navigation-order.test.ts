import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import type { Shell } from '@shell';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const text = (t: string): ActionDefinition['layout'] => ({ component: 'Text', children: t });
const stackOf = (shell: Shell): string =>
  shell.getCanvasState('main').stack.map((item) => `${item.definitionId}:${item.status}`).join(' > ');

const home: ActionDefinition = { id: 'home', layout: text('home') };
const child: ActionDefinition = { id: 'child', layout: text('child') };

describe('a mount hook that navigates', () => {
  const opened = async (mount: ActionDefinition['lifecycle']): Promise<Shell> => {
    const opener: ActionDefinition = { id: 'opener', lifecycle: mount, layout: text('opener') };
    const shell = createShell({ canvases: [{ id: 'main', initial: 'home' }], actions: { home, child, opener } });
    await later();
    shell.push('main', 'opener');
    await later();
    return shell;
  };

  it('pushes on top of the action whose mount it is', async () => {
    expect(stackOf(await opened({ mount: [{ push: { action: 'child' } }] }))).toBe('home:suspended > opener:suspended > child:active');
  });

  it('closes the action whose mount it is with removeSelf', async () => {
    expect(stackOf(await opened({ mount: [{ removeSelf: true }] }))).toBe('home:active');
  });

  it('pops the action whose mount it is', async () => {
    expect(stackOf(await opened({ mount: [{ pop: true }] }))).toBe('home:active');
  });

  it('pushing onto another canvas, the first snapshot already shows the instance on its own canvas', async () => {
    const side: ActionDefinition = { id: 'side', layout: text('s') };
    const opener: ActionDefinition = { id: 'opener', lifecycle: { mount: [{ push: { action: 'side', canvas: 'aside' } }] }, layout: text('o') };
    const shell = createShell({ canvases: [{ id: 'main' }, { id: 'aside' }], actions: { opener, side } });
    const seen: string[] = [];
    shell.onStateChange((s) => seen.push(Object.entries(s.canvases).map(([c, v]) => `${c}=${v.stack.map((i) => i.definitionId).join('+')}`).join(' ')));
    shell.push('main', 'opener');
    await later();
    expect(seen).toEqual(['main=opener aside=side', 'main=opener aside=side']);
  });
});

describe('a push and a pop before the covered action finished suspending', () => {
  const base: ActionDefinition = {
    id: 'a',
    data: { clicks: 0 },
    triggers: [{ event: 'ui:click', ref: 'b', do: [{ increment: 'clicks' }] }],
    layout: { component: 'Button', ref: 'b', children: 'x' },
  };

  it('leaves the action on top active when its suspend hook is slow', async () => {
    const a: ActionDefinition = { ...base, endpoints: { save: { fn: 'save' } }, lifecycle: { suspend: [{ call: 'save' }] } };
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'a' }],
      actions: { a, dialog: child },
      functions: { save: async () => later(30) },
    });
    await later();
    shell.push('main', 'dialog');
    await later(1);
    shell.pop('main');
    await later(60);
    expect(stackOf(shell)).toBe('a:active');
    const top = shell.getCanvasState('main').active;
    shell.dispatch({ type: 'ui:click', ref: 'b' });
    await later();
    expect(top === undefined ? undefined : shell.getRuntime(top.id)?.getData()['clicks']).toBe(1);
  });

  it('leaves the action on top active when both happen in one turn', async () => {
    const shell = createShell({ canvases: [{ id: 'main', initial: 'a' }], actions: { a: base, dialog: child } });
    await later();
    shell.push('main', 'dialog');
    shell.pop('main');
    await later();
    expect(stackOf(shell)).toBe('a:active');
  });
});
