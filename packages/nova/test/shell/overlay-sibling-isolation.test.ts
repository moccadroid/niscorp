import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { ShellConfig } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const overview: ActionDefinition = { id: 'overview', data: {} };
const products: ActionDefinition = { id: 'products', data: {} };
const detail: ActionDefinition = { id: 'detail', data: {} };
const plans: ActionDefinition = { id: 'plans', data: {} };
const productNew: ActionDefinition = {
  id: 'product-new',
  data: {},
  triggers: [
    { event: 'ui:click', ref: 'save', do: [{ push: { action: 'detail', canvas: 'main', input: { row: 1 } } }, { pop: true }] },
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
  ],
};

const setup = (config: Partial<ShellConfig> = {}) =>
  createShell({
    canvases: [{ id: 'main', initial: 'overview' }, { id: 'sheet' }, { id: 'chrome' }],
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    actions: { overview, products, detail, plans, 'product-new': productNew },
    ...config,
  });

const ids = (shell: ReturnType<typeof createShell>, canvas = 'main'): string[] =>
  shell.getCanvasState(canvas).stack.map((i) => i.definitionId);

describe('overlay verbs never touch a sibling canvas (the reported invariant, held)', () => {
  it('popping the overlay leaves a single-instance sibling byte-identical', () => {
    const shell = setup();
    shell.replace('main', 'products');
    const mainInstance = shell.getCanvasState('main').active?.id;

    shell.push('sheet', 'product-new');
    shell.pop('sheet');

    expect(ids(shell, 'sheet')).toEqual([]);
    expect(ids(shell)).toEqual(['products']);
    expect(shell.getCanvasState('main').active?.id).toBe(mainInstance);
  });

  it('popping the overlay leaves a deep sibling alone too (same code path)', () => {
    const shell = setup();
    shell.replace('main', 'products');
    shell.push('main', 'plans');
    shell.push('sheet', 'product-new');
    shell.pop('sheet');
    expect(ids(shell)).toEqual(['products', 'plans']);
  });

  it('removeInstance on the overlay never re-seeds the sibling', () => {
    const shell = setup();
    shell.replace('main', 'products');
    const modalId = shell.push('sheet', 'product-new');
    shell.removeInstance('sheet', modalId);
    expect(ids(shell, 'sheet')).toEqual([]);
    expect(ids(shell)).toEqual(['products']);
  });

  it('the create→open modal trigger (push main + pop sheet) opens the record and never resets main', async () => {
    const shell = setup();
    shell.replace('main', 'products');
    const modalId = shell.push('sheet', 'product-new');
    await tick();
    const runtime = getInternalRuntime(shell, modalId);
    if (runtime === undefined) throw new Error('no modal runtime');
    await runtime.executeSteps([{ push: { action: 'detail', canvas: 'main', input: { row: 1 } } }, { pop: true }]);
    await tick();
    expect(ids(shell)).toEqual(['products', 'detail']);
    expect(ids(shell, 'sheet')).toEqual([]);
  });
});

describe('MECHANISM: the revert is back(), restoring the sibling’s recorded seed', () => {
  it('single-instance sibling: a back() after the overlay closes reverts main to its seed', () => {
    const shell = setup();
    shell.replace('main', 'products');
    shell.push('sheet', 'product-new');
    shell.pop('sheet');
    expect(ids(shell)).toEqual(['products']);

    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['overview']);
  });

  it('deep sibling (≥2): the same back() only pops one frame — stays on the section', () => {
    const shell = setup();
    shell.replace('main', 'products');
    shell.push('main', 'plans');
    shell.push('sheet', 'product-new');
    shell.pop('sheet');

    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['products']);
  });

  it('resetTo section nav (relay’s idiom, not just replace) reverts to the seed the same way', async () => {
    const shell = setup();
    const seedId = shell.getCanvasState('main').active?.id ?? '';
    const runtime = getInternalRuntime(shell, seedId);
    if (runtime === undefined) throw new Error('no runtime');
    await runtime.executeSteps([{ resetTo: { action: 'products', canvas: 'main' } }]);
    await tick();
    expect(ids(shell)).toEqual(['products']);

    shell.push('sheet', 'product-new');
    shell.pop('sheet');
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['overview']);
  });
});
