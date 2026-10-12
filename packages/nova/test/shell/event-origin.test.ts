import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('shell — origin-scoped UI events', () => {
  const counter: ActionDefinition = {
    id: 'counter',
    data: { n: 0 },
    triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
  };

  const setup = () =>
    createShell({
      canvases: [{ id: 'main' }, { id: 'aside' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { counter },
    });

  it('an origin-stamped event reaches only its own instance', async () => {
    const shell = setup();
    const a = shell.push('main', 'counter');
    const b = shell.push('aside', 'counter');
    await tick();

    shell.dispatch({ type: 'ui:click', ref: 'bump', origin: a });
    await tick();
    expect(shell.getRuntime(a)?.getData()).toEqual({ n: 1 });
    expect(shell.getRuntime(b)?.getData()).toEqual({ n: 0 });

    shell.dispatch({ type: 'ui:click', ref: 'bump', origin: b });
    await tick();
    expect(shell.getRuntime(a)?.getData()).toEqual({ n: 1 });
    expect(shell.getRuntime(b)?.getData()).toEqual({ n: 1 });
  });

  it('an event with no origin stays global (programmatic dispatch)', async () => {
    const shell = setup();
    const a = shell.push('main', 'counter');
    const b = shell.push('aside', 'counter');
    await tick();

    shell.dispatch({ type: 'ui:click', ref: 'bump' });
    await tick();
    expect(shell.getRuntime(a)?.getData()).toEqual({ n: 1 });
    expect(shell.getRuntime(b)?.getData()).toEqual({ n: 1 });
  });
});
