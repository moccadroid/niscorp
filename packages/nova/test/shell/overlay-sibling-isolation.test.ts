import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { ShellConfig } from '@shell';
import { getInternalRuntime } from '@shell/shell-internals';

// ═══════════════════════════════════════════════════════════
// Overlay ↔ sibling isolation, and where a "single-instance canvas reverts to
// its initial when an overlay closes" actually comes from.
//
// A case (niscorp 854d966) reported that closing a modal on an OVERLAY canvas
// silently reset a SIBLING base canvas (`main`) to its seed — but only when the
// sibling held exactly one instance; a sibling ≥2 deep was left alone. The
// report attributed it to the shell RE-SEEDING a canvas whose stack fell to
// depth one on an overlay pop.
//
// These tests pin down the truth:
//   1. GUARANTEE — every overlay-scoped verb (pop / removeInstance / clear /
//      popTo) touches ONLY its own canvas. A sibling is never re-seeded, at any
//      depth. There is no re-seed-on-pop path.
//   2. MECHANISM — the revert is `shell.back()` restoring a journal entry that
//      recorded the sibling's PRE-navigation position. Top-level section nav
//      uses replace/resetTo from the seeded floor, so that recorded position IS
//      the seed. Restoring it reads as "the app reset itself." The depth-
//      dependence is exactly restore()'s common-prefix rule: one instance →
//      re-derive the seed; two-plus → pop a single frame.
//
// `back()` is reachable only from the host (moss's browser-back bridge →
// session.back(), or a dev-check). It is NOT a NavigationEffect, so a modal's
// ✕ trigger — which can only `pop` — can never invoke it.
// ═══════════════════════════════════════════════════════════

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const overview: ActionDefinition = { id: 'overview', data: {} };
const products: ActionDefinition = { id: 'products', data: {} };
const detail: ActionDefinition = { id: 'detail', data: {} };
const plans: ActionDefinition = { id: 'plans', data: {} };
// A create modal whose submit runs the reporter's create→open onSuccess, and
// whose ✕ pops — both are ordinary action effects (never `back`).
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
    // main seeded (the landing floor), sheet is the modal overlay, chrome is the frame.
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
    shell.replace('main', 'products'); // section nav → main is one instance
    const mainInstance = shell.getCanvasState('main').active?.id;

    shell.push('sheet', 'product-new');
    shell.pop('sheet'); // close the modal — the ✕/backdrop gesture

    expect(ids(shell, 'sheet')).toEqual([]);
    expect(ids(shell)).toEqual(['products']);
    // same instance object, not a re-seeded replacement
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
    // exactly what the ✕/confirm trigger does — ordinary effects, no back
    await runtime.executeSteps([{ push: { action: 'detail', canvas: 'main', input: { row: 1 } } }, { pop: true }]);
    await tick();
    expect(ids(shell)).toEqual(['products', 'detail']); // record opened
    expect(ids(shell, 'sheet')).toEqual([]); // modal closed
  });
});

describe('MECHANISM: the revert is back(), restoring the sibling’s recorded seed', () => {
  it('single-instance sibling: a back() after the overlay closes reverts main to its seed', () => {
    const shell = setup();
    shell.replace('main', 'products'); // records main:[overview] — the pre-nav (seed) position
    shell.push('sheet', 'product-new');
    shell.pop('sheet'); // consumes the sheet’s own journal entry; main untouched
    expect(ids(shell)).toEqual(['products']);

    // a host-level back (moss trapBack → session.back(), or a dev-check) now
    // spends the newest remaining entry — which is main’s recorded seed.
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['overview']); // the reported "silent reset"
  });

  it('deep sibling (≥2): the same back() only pops one frame — stays on the section', () => {
    const shell = setup();
    shell.replace('main', 'products'); // records main:[overview]
    shell.push('main', 'plans'); // records main:[products]
    shell.push('sheet', 'product-new');
    shell.pop('sheet');

    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['products']); // pops plans, does NOT reach the seed
  });

  it('resetTo section nav (relay’s idiom, not just replace) reverts to the seed the same way', async () => {
    const shell = setup();
    // resetTo from the seeded floor, exactly as relay’s sidebar nav does — run it
    // on the seed instance so it goes through the real navigation handler.
    const seedId = shell.getCanvasState('main').active?.id ?? '';
    const runtime = getInternalRuntime(shell, seedId);
    if (runtime === undefined) throw new Error('no runtime');
    await runtime.executeSteps([{ resetTo: { action: 'products', canvas: 'main' } }]); // records main:[overview]
    await tick();
    expect(ids(shell)).toEqual(['products']); // main is a single instance

    shell.push('sheet', 'product-new');
    shell.pop('sheet');
    // back walks the resetTo just like the replace case above
    expect(shell.back()).toBe(true);
    expect(ids(shell)).toEqual(['overview']);
  });
});
