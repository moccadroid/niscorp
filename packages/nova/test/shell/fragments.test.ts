import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition, ActionFragment } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

const modal: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
  // Chrome wrapping a body slot, plus a pre-wired close.
  layout: { component: 'Dialog', children: [{ component: 'Close', ref: 'close' }, { slot: 'body' }] },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
};

const form: ActionDefinition = {
  id: 'form',
  layout: { component: 'Text', children: 'FORM' },
};

const settle = () => new Promise((r) => setTimeout(r, 0));

const makeShell = () =>
  createShell({
    canvases: [{ id: 'modal' }],
    fragments: { modal },
    actions: { form },
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
  });

describe('ActionFragment composition — push `with`', () => {
  it('wraps the action in the fragment chrome (slot filled with the action layout)', async () => {
    const shell = makeShell();
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();

    const tree = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('modal')));
    expect(tree).toContain('Dialog'); // chrome from the fragment
    expect(tree).toContain('FORM'); // body from the action
    shell.dispose();
  });

  it('a fragment trigger (close) acts on the composed instance', async () => {
    const shell = makeShell();
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();
    expect(shell.getCanvasState('modal').active).toBeDefined();

    shell.dispatch({ type: 'ui:click', ref: 'close' });
    await settle();
    expect(shell.getCanvasState('modal').active).toBeUndefined();
    shell.dispose();
  });

  it('a fragment id cannot be pushed as an action', () => {
    const shell = makeShell();
    expect(() => shell.push('modal', 'modal')).toThrow();
    shell.dispose();
  });

  it('composes a canvas `initial` seed with `with`', async () => {
    const shell = createShell({
      canvases: [{ id: 'modal', initial: { action: 'form', with: ['modal'] } }],
      fragments: { modal },
      actions: { form },
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
    });
    await settle();

    const tree = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('modal')));
    expect(tree).toContain('Dialog'); // chrome from the fragment
    expect(tree).toContain('FORM'); // body from the action
    shell.dispose();
  });
});
