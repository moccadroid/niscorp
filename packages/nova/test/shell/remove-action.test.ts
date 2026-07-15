import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition, ActionFragment } from '@action';
import { createLayoutStore } from '@layout';
import { UnknownActionError } from '@shared/errors';
import { createShell } from '@shell';

const defA: ActionDefinition = { id: 'A', data: { v: 1 } };
const defB: ActionDefinition = { id: 'B', data: { v: 2 } };
const frame: ActionFragment = { kind: 'fragment', id: 'frame' };

const makeShell = () =>
  createShell({
    canvases: [{ id: 'main' }, { id: 'side' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { A: defA, B: defB },
    fragments: { frame },
  });

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('shell.removeAction', () => {
  it('removes the definition — push then throws UnknownActionError', async () => {
    const shell = makeShell();
    shell.removeAction('A');
    expect(() => shell.push('main', 'A')).toThrow(UnknownActionError);
  });

  it('unmounts live instances of the removed definition', async () => {
    const shell = makeShell();
    const id = shell.push('main', 'A');
    await tick();
    shell.removeAction('A');
    await tick();
    expect(shell.getCanvasState('main').stack).toHaveLength(0);
    expect(shell.getRuntime(id)).toBeUndefined();
  });

  it('leaves other definitions and their instances untouched, and resumes the new top', async () => {
    const shell = makeShell();
    const bottom = shell.push('main', 'B');
    shell.push('main', 'A');
    shell.push('side', 'B');
    await tick();
    shell.removeAction('A');
    await tick();
    const main = shell.getCanvasState('main');
    expect(main.stack.map((i) => i.id)).toEqual([bottom]);
    expect(main.active?.definitionId).toBe('B');
    expect(main.active?.status).toBe('active');
    expect(shell.getCanvasState('side').stack).toHaveLength(1);
    expect(() => shell.push('side', 'B')).not.toThrow();
  });

  it('removes a mid-stack instance without disturbing the ones above it', async () => {
    const shell = makeShell();
    shell.push('main', 'B');
    shell.push('main', 'A');
    const top = shell.push('main', 'B');
    await tick();
    shell.removeAction('A');
    await tick();
    const main = shell.getCanvasState('main');
    expect(main.stack.map((i) => i.definitionId)).toEqual(['B', 'B']);
    expect(main.active?.id).toBe(top);
    expect(main.active?.status).toBe('active');
  });

  it('removes fragment-composed instances by their base action id, leaving the fragment registered', async () => {
    const shell = makeShell();
    shell.push('main', 'A', undefined, ['frame']);
    await tick();
    shell.removeAction('A');
    await tick();
    expect(shell.getCanvasState('main').stack).toHaveLength(0);
    expect(() => shell.push('main', 'B', undefined, ['frame'])).not.toThrow();
  });

  it('is a no-op for an unknown id', () => {
    const shell = makeShell();
    expect(() => shell.removeAction('nope')).not.toThrow();
    expect(() => shell.push('main', 'A')).not.toThrow();
  });

  it('a removed action can be re-registered', async () => {
    const shell = makeShell();
    shell.removeAction('A');
    shell.registerAction(defA);
    expect(() => shell.push('main', 'A')).not.toThrow();
  });
});
