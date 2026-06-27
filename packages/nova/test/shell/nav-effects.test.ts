import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ═══════════════════════════════════════════════════════════
// The popTo + resetTo navigation effects (stack-nav primitives).
// ═══════════════════════════════════════════════════════════

describe('shell — popTo / resetTo navigation effects', () => {
  const setup = (actions: Record<string, ActionDefinition>) =>
    createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions,
    });

  it('popTo pops a canvas down to a given instance', async () => {
    const A: ActionDefinition = { id: 'A' };
    const B: ActionDefinition = { id: 'B' };
    const C: ActionDefinition = {
      id: 'C',
      triggers: [{ event: 'ui:click', ref: 'jump', do: [{ popTo: { instance: '$.target' } }] }],
    };
    const shell = setup({ A, B, C });

    const aId = shell.push('main', 'A');
    await tick();
    shell.push('main', 'B');
    await tick();
    shell.push('main', 'C', { target: aId });
    await tick();
    expect(shell.getCanvasState('main').stack.length).toBe(3);

    // The active C fires popTo back to A (suspended B/A under it no-op).
    shell.dispatch({ type: 'ui:click', ref: 'jump' });
    await tick();
    const st = shell.getCanvasState('main');
    expect(st.active?.id).toBe(aId);
    expect(st.stack.length).toBe(1);
  });

  it('popTo is a no-op when the instance is not in the stack', async () => {
    const A: ActionDefinition = {
      id: 'A',
      triggers: [{ event: 'ui:click', ref: 'jump', do: [{ popTo: { instance: 'nope' } }] }],
    };
    const shell = setup({ A });
    shell.push('main', 'A');
    await tick();
    shell.dispatch({ type: 'ui:click', ref: 'jump' });
    await tick();
    // Stack untouched — a stale crumb can't clear the canvas.
    expect(shell.getCanvasState('main').stack.length).toBe(1);
  });

  it('resetTo clears a canvas and sets a new root', async () => {
    const A: ActionDefinition = { id: 'A' };
    const C: ActionDefinition = {
      id: 'C',
      triggers: [{ event: 'ui:click', ref: 'reset', do: [{ resetTo: { action: 'B' } }] }],
    };
    const B: ActionDefinition = { id: 'B' };
    const shell = setup({ A, B, C });

    shell.push('main', 'A');
    await tick();
    shell.push('main', 'C');
    await tick();
    expect(shell.getCanvasState('main').stack.length).toBe(2);

    shell.dispatch({ type: 'ui:click', ref: 'reset' });
    await tick();
    const st = shell.getCanvasState('main');
    expect(st.stack.length).toBe(1);
    expect(st.active?.definitionId).toBe('B');
  });
});
