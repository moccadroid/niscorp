import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition, ActionFragment } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import { DefinitionValidationError, UnknownActionError, UnknownFragmentError } from '@shared';

const modal: ActionFragment = {
  kind: 'fragment',
  id: 'modal',
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
    expect(tree).toContain('Dialog');
    expect(tree).toContain('FORM');
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
    expect(tree).toContain('Dialog');
    expect(tree).toContain('FORM');
    shell.dispose();
  });
});

describe('actions and fragments — one registry', () => {
  const bare = () => createShell({ canvases: [{ id: 'modal' }], actions: { form }, registry: createPermissiveRegistry(), layoutStore: createLayoutStore() });
  const drawn = (shell: ReturnType<typeof createShell>): string => JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('modal')));

  it('`registerAction` takes a fragment, and a push `with` it then finds it', async () => {
    const shell = bare();
    expect(() => shell.push('modal', 'form', undefined, ['modal'])).toThrow(UnknownFragmentError);

    shell.registerAction(modal);
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();

    expect(drawn(shell)).toContain('Dialog');
    shell.dispose();
  });

  it('`removeAction` takes a fragment out: a later push `with` it is refused, and what is open keeps what it was composed with', async () => {
    const shell = makeShell();
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();

    shell.removeAction('modal');

    expect(() => shell.push('modal', 'form', undefined, ['modal'])).toThrow(UnknownFragmentError);
    expect(shell.getCanvasState('modal').stack).toHaveLength(1);
    expect(drawn(shell)).toContain('Dialog');
    shell.dispatch({ type: 'ui:click', ref: 'close' });
    await settle();
    expect(shell.getCanvasState('modal').active).toBeUndefined();
    shell.dispose();
  });

  it('a fragment is not opened by itself, and an action is not what another is composed `with`', () => {
    const shell = makeShell();
    expect(() => shell.push('modal', 'modal')).toThrow(UnknownActionError);
    expect(() => shell.push('modal', 'form', undefined, ['form'])).toThrow(UnknownFragmentError);
    shell.dispose();
  });

  it('`back` skips a position that was opened with a fragment taken out since, and goes to the one before it', async () => {
    const first: ActionDefinition = { id: 'first', layout: { component: 'Text', children: 'FIRST' } };
    const other: ActionDefinition = { id: 'other', layout: { component: 'Text', children: 'OTHER' } };
    const shell = createShell({ canvases: [{ id: 'modal' }], fragments: { modal }, actions: { first, form, other }, registry: createPermissiveRegistry(), layoutStore: createLayoutStore() });
    shell.push('modal', 'first');
    shell.replace('modal', 'form', undefined, ['modal']);
    shell.replace('modal', 'other');
    await settle();

    shell.removeAction('modal');

    expect(shell.back()).toBe(true);
    await settle();
    expect(shell.getCanvasState('modal').stack.map((instance) => instance.definitionId)).toEqual(['first']);
    expect(drawn(shell)).toContain('FIRST');
    shell.dispose();
  });

  it('what is not a definition is refused as one that does not parse, and an id an object has of its own accord is a fragment’s to take', () => {
    const shell = makeShell();
    expect(() => shell.registerAction('form' as never)).toThrow(DefinitionValidationError);
    expect(() => shell.registerAction({ ...modal, id: 'toString' })).not.toThrow();
    shell.dispose();
  });

  it('a fragment handed to `createShell` is validated, as an action is', () => {
    const broken = { kind: 'fragment', id: 'broken', triggers: 'none' } as unknown as ActionFragment;
    expect(() => createShell({ canvases: [{ id: 'modal' }], actions: { form }, fragments: { broken }, registry: createPermissiveRegistry(), layoutStore: createLayoutStore() })).toThrow(
      DefinitionValidationError,
    );
  });

  it('an id names an action or a fragment, never both', async () => {
    const twice = (): unknown =>
      createShell({ canvases: [{ id: 'modal' }], actions: { form }, fragments: { form: { ...modal, id: 'form' } }, registry: createPermissiveRegistry(), layoutStore: createLayoutStore() });
    expect(twice).toThrow(DefinitionValidationError);
    expect(twice).toThrow('"form" is the id of an action and of a fragment');

    const shell = makeShell();
    expect(() => shell.registerAction({ ...modal, id: 'form' })).toThrow('"form" is the id of an action and of a fragment');
    expect(() => shell.registerAction({ ...form, id: 'modal' })).toThrow('"modal" is the id of an action and of a fragment');
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();
    expect(drawn(shell)).toContain('Dialog');
    expect(drawn(shell)).toContain('FORM');
    shell.dispose();
  });

  it('a fragment registered again takes the place of the one before, as an action does', async () => {
    const shell = makeShell();
    shell.registerAction({ ...modal, layout: { component: 'Drawer', children: [{ slot: 'body' }] } });
    shell.push('modal', 'form', undefined, ['modal']);
    await settle();

    expect(drawn(shell)).toContain('Drawer');
    shell.dispose();
  });

  it('the shell has no call of its own for a fragment', () => {
    const shell = makeShell();
    expect('registerFragment' in shell).toBe(false);
    shell.dispose();
  });
});
