import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ═══════════════════════════════════════════════════════════
// Origin-scoped UI events. A UI event stamped with an `origin` (the dispatching
// instance id, set automatically by ActionSlot) reaches only that instance's
// triggers — so the SAME action mounted on two canvases doesn't double-fire on
// one click. Events without an origin (programmatic shell.dispatch) stay global.
// ═══════════════════════════════════════════════════════════

describe('shell — origin-scoped UI events', () => {
  // A counter action: a `bump` click increments its own `n`. Mounted on two
  // canvases, each instance keeps its own count.
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

    // A click originating from instance A (what ActionSlot stamps) bumps A only.
    shell.dispatch({ type: 'ui:click', ref: 'bump', origin: a });
    await tick();
    expect(shell.getRuntime(a)?.getData()).toEqual({ n: 1 });
    expect(shell.getRuntime(b)?.getData()).toEqual({ n: 0 });

    // And one from B bumps B only — no cross-canvas leak.
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

    // No origin → both active instances react (back-compat with shell.dispatch).
    shell.dispatch({ type: 'ui:click', ref: 'bump' });
    await tick();
    expect(shell.getRuntime(a)?.getData()).toEqual({ n: 1 });
    expect(shell.getRuntime(b)?.getData()).toEqual({ n: 1 });
  });
});
