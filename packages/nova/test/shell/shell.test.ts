import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createShell } from '@shell';

const defA: ActionDefinition = { id: 'A', data: { v: 1 } };
const defB: ActionDefinition = { id: 'B', data: { v: 2 } };

const makeShell = () =>
  createShell({
    canvases: ['main', 'side'],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { A: defA, B: defB },
  });

describe('createShell — lifecycle', () => {
  it('push then active reflects definition', async () => {
    const shell = makeShell();
    const id = shell.push('main', 'A');
    await new Promise((r) => setTimeout(r, 0));
    const canvas = shell.getCanvasState('main');
    expect(canvas.stack).toHaveLength(1);
    expect(canvas.active?.id).toBe(id);
    expect(canvas.active?.definitionId).toBe('A');
    expect(shell.getRuntime(id)).toBeDefined();
  });

  it('multiple canvases are independent', async () => {
    const shell = makeShell();
    shell.push('main', 'A');
    shell.push('side', 'B');
    await new Promise((r) => setTimeout(r, 0));
    expect(shell.getCanvasState('main').active?.definitionId).toBe('A');
    expect(shell.getCanvasState('side').active?.definitionId).toBe('B');
  });

  it('pop removes top and resumes prior', async () => {
    const shell = makeShell();
    const a = shell.push('main', 'A');
    shell.push('main', 'B');
    await new Promise((r) => setTimeout(r, 0));
    shell.pop('main');
    await new Promise((r) => setTimeout(r, 0));
    const c = shell.getCanvasState('main');
    expect(c.stack).toHaveLength(1);
    expect(c.active?.id).toBe(a);
  });

  it('replace swaps top', async () => {
    const shell = makeShell();
    shell.push('main', 'A');
    const newId = shell.replace('main', 'B');
    await new Promise((r) => setTimeout(r, 0));
    const c = shell.getCanvasState('main');
    expect(c.stack).toHaveLength(1);
    expect(c.active?.id).toBe(newId);
    expect(c.active?.definitionId).toBe('B');
  });

  it('clear empties the canvas', async () => {
    const shell = makeShell();
    shell.push('main', 'A');
    shell.push('main', 'B');
    await new Promise((r) => setTimeout(r, 0));
    shell.clear('main');
    expect(shell.getCanvasState('main').stack).toHaveLength(0);
  });

  it('dispose tears everything down', async () => {
    const shell = makeShell();
    const id = shell.push('main', 'A');
    await new Promise((r) => setTimeout(r, 0));
    shell.dispose();
    expect(shell.getRuntime(id)).toBeUndefined();
  });

  it('throws on unknown action', () => {
    const shell = makeShell();
    expect(() => shell.push('main', 'nope')).toThrow();
  });
});
