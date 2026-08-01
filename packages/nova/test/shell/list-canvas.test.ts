import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ═══════════════════════════════════════════════════════════
// A `mode: 'list'` canvas is a tray: every card stays LIVE and visible at
// once, instead of the default stack where only the top is active. Push does
// not suspend; a card closes ITSELF (not the top) via `{ removeSelf: true }`;
// removeInstance drops any one card and leaves the rest running.
// ═══════════════════════════════════════════════════════════

describe('shell — list-mode canvas', () => {
  const card = (id: string): ActionDefinition => ({
    id,
    data: { pings: 0 },
    triggers: [
      { event: 'ui:click', ref: 'ping', do: [{ increment: 'pings' }] },
      { event: 'ui:click', ref: 'close', do: [{ removeSelf: true }] },
    ],
  });

  const setup = (actions: Record<string, ActionDefinition>) =>
    createShell({
      canvases: [{ id: 'tray', mode: 'list' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions,
    });

  const ids = (shell: ReturnType<typeof setup>): string[] => shell.getCanvasState('tray').stack.map((i) => i.id);

  it('keeps every card live — a pushed card does not suspend the ones beneath', async () => {
    const shell = setup({ A: card('A'), B: card('B') });
    const a = shell.push('tray', 'A');
    await tick();
    const b = shell.push('tray', 'B');
    await tick();

    expect(ids(shell)).toEqual([a, b]);

    // In a stack, pushing B would suspend A and this ping would be ignored.
    shell.dispatch({ type: 'ui:click', ref: 'ping', origin: a });
    await tick();
    shell.dispatch({ type: 'ui:click', ref: 'ping', origin: b });
    await tick();
    expect(shell.getRuntime(a)?.getData()['pings']).toBe(1);
    expect(shell.getRuntime(b)?.getData()['pings']).toBe(1);
  });

  it('removeInstance drops one card and leaves the rest live', async () => {
    const shell = setup({ A: card('A'), B: card('B'), C: card('C') });
    const a = shell.push('tray', 'A');
    await tick();
    const b = shell.push('tray', 'B');
    await tick();
    const c = shell.push('tray', 'C');
    await tick();

    shell.removeInstance('tray', b);
    await tick();

    expect(shell.getRuntime(b)).toBeUndefined();
    expect(ids(shell)).toEqual([a, c]);
    // A — never the top — is still live after a middle card was removed.
    shell.dispatch({ type: 'ui:click', ref: 'ping', origin: a });
    await tick();
    expect(shell.getRuntime(a)?.getData()['pings']).toBe(1);
  });

  it('a card closes ITSELF via removeSelf, not whatever is on top', async () => {
    const shell = setup({ A: card('A'), B: card('B') });
    const a = shell.push('tray', 'A');
    await tick();
    const b = shell.push('tray', 'B');
    await tick();

    // Close A while B is on top — removeSelf must remove the firing card.
    shell.dispatch({ type: 'ui:click', ref: 'close', origin: a });
    await tick();

    expect(shell.getRuntime(a)).toBeUndefined();
    expect(shell.getRuntime(b)).toBeDefined();
    expect(ids(shell)).toEqual([b]);
  });

  it('removeInstance is a no-op for an instance not in the canvas', async () => {
    const shell = setup({ A: card('A') });
    const a = shell.push('tray', 'A');
    await tick();
    shell.removeInstance('tray', 'not-a-real-id');
    await tick();
    expect(ids(shell)).toEqual([a]);
    expect(shell.getRuntime(a)).toBeDefined();
  });
});

// A stack canvas still suspends and resumes, and removeSelf there removes the
// firing (top) instance, resuming the one beneath — the default is untouched.
describe('shell — removeSelf on a stack canvas', () => {
  it('removes the firing instance and resumes the one beneath', async () => {
    const A: ActionDefinition = { id: 'A', data: { resumed: false }, lifecycle: { resume: [{ set: 'resumed', value: true }] } };
    const B: ActionDefinition = { id: 'B', triggers: [{ event: 'ui:click', ref: 'close', do: [{ removeSelf: true }] }] };
    const shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A, B },
    });

    const a = shell.push('main', 'A');
    await tick();
    const b = shell.push('main', 'B');
    await tick();
    shell.dispatch({ type: 'ui:click', ref: 'close', origin: b });
    await tick();

    expect(shell.getRuntime(b)).toBeUndefined();
    expect(shell.getCanvasState('main').active?.id).toBe(a);
    expect(shell.getRuntime(a)?.getData()['resumed']).toBe(true);
  });
});

// ── `reload` — re-read ONE card in place ────────────────────
// A stack canvas suspends what it covers, and `resume` re-runs mount, so a
// revealed action is never stale. A list canvas suspends nothing: every card
// stays active, so nothing would ever re-read one. `reload` re-runs the firing
// instance's own mount hook — same instance, same data object, no navigation.
describe('shell — the reload effect', () => {
  const reader = (id: string): ActionDefinition => ({
    id,
    data: { value: '', mounts: 0 },
    lifecycle: { mount: [{ increment: 'mounts' }, { call: 'read' }] },
    endpoints: { read: { fn: 'read', target: 'value' } },
    triggers: [{ event: 'ui:click', ref: 'open', do: [{ reload: true }] }],
  });

  it("re-runs the firing card's mount hook and leaves its siblings alone", async () => {
    let served = 'first';
    const shell = createShell({
      canvases: [{ id: 'tray', mode: 'list' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A: reader('A'), B: reader('B') },
      functions: { read: async () => served },
    });

    const a = shell.push('tray', 'A');
    const b = shell.push('tray', 'B');
    await tick();
    expect(shell.getRuntime(a)?.getData()['value']).toBe('first');
    expect(shell.getRuntime(b)?.getData()['value']).toBe('first');

    // The world moves under both cards while they sit there, live.
    served = 'second';
    shell.dispatch({ type: 'ui:click', ref: 'open', origin: a });
    await tick();

    expect(shell.getRuntime(a)?.getData()['value']).toBe('second');
    expect(shell.getRuntime(a)?.getData()['mounts']).toBe(2);
    // The card nobody opened is untouched — this is not a canvas refresh.
    expect(shell.getRuntime(b)?.getData()['value']).toBe('first');
    expect(shell.getRuntime(b)?.getData()['mounts']).toBe(1);
    // And the stack is unchanged: a re-read, not a remount.
    expect(shell.getCanvasState('tray').stack.map((i) => i.id)).toEqual([a, b]);
  });

  it('is a no-op on an action with no mount hook', async () => {
    const A: ActionDefinition = {
      id: 'A',
      data: { n: 0 },
      triggers: [{ event: 'ui:click', ref: 'open', do: [{ increment: 'n' }, { reload: true }] }],
    };
    const shell = createShell({
      canvases: [{ id: 'tray', mode: 'list' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { A },
    });
    const a = shell.push('tray', 'A');
    await tick();
    shell.dispatch({ type: 'ui:click', ref: 'open', origin: a });
    await tick();
    expect(shell.getRuntime(a)?.getData()['n']).toBe(1);
  });
});
