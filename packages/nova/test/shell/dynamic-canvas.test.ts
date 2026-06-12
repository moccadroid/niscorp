import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const defA: ActionDefinition = { id: 'A', data: { v: 1 } };

const makeShell = () =>
  createShell({
    canvases: [{ id: 'main' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { A: defA },
  });

// The default shell layout loops $.canvases into a CanvasSlot per canvas, so the
// rendered shell tree carries `"canvasId":"<id>"` for every rendered canvas.
const renderedCanvasIds = (shell: ReturnType<typeof makeShell>): string[] =>
  [...JSON.stringify(shell.getShellRenderTree()).matchAll(/"canvasId":"([^"]+)"/g)].map((m) => m[1]!);

describe('createShell — dynamic canvases', () => {
  it('addCanvas adds a canvas, renders it, and seeds its initial action', async () => {
    const shell = makeShell();
    shell.addCanvas({ id: 'extra', initial: 'A' });
    await new Promise((r) => setTimeout(r, 0));

    expect(shell.getCanvasState('extra').active?.definitionId).toBe('A');
    expect(renderedCanvasIds(shell)).toEqual(['main', 'extra']);
  });

  it('addCanvas is a no-op when the id already exists', () => {
    const shell = makeShell();
    shell.addCanvas({ id: 'main' });
    expect(renderedCanvasIds(shell)).toEqual(['main']);
  });

  it('removeCanvas drops the canvas and unmounts its instances', async () => {
    const shell = makeShell();
    shell.push('main', 'A');
    await new Promise((r) => setTimeout(r, 0));

    shell.removeCanvas('main');
    expect(shell.getState().canvases['main']).toBeUndefined();
    expect(renderedCanvasIds(shell)).toEqual([]);
  });

  it('setCanvasLayout replaces the shell layout', () => {
    const shell = makeShell();
    shell.setCanvasLayout({ component: 'Solo' });
    const tree = JSON.stringify(shell.getShellRenderTree());
    expect(tree).toContain('Solo');
    expect(tree).not.toContain('CanvasSlot');
  });

  it('registerAction adds a definition a canvas can then seed', async () => {
    const shell = makeShell();
    shell.registerAction({ id: 'B', data: { v: 2 } });
    shell.addCanvas({ id: 'extra', initial: 'B' });
    await new Promise((r) => setTimeout(r, 0));

    expect(shell.getCanvasState('extra').active?.definitionId).toBe('B');
  });

  it('push throws for an action that was never registered', () => {
    const shell = makeShell();
    expect(() => shell.push('main', 'missing')).toThrow();
  });
});
