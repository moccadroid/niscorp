import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';

// ═══════════════════════════════════════════════════════════
// A CanvasSlot INSIDE AN ACTION'S LAYOUT — an action that arranges canvases
// (a controller whose regions are canvases of their own). The contract a host
// relies on: flattening a canvas's tree inlines the frame's slots but leaves a
// slot inside an action's content as a MARKER, so the inner canvas is served
// and rendered as itself — its own tree, its own events — not folded into the
// action that placed it.
// ═══════════════════════════════════════════════════════════

const arrangement: ActionDefinition = {
  id: 'arrangement',
  layout: { component: 'Box', children: [{ component: 'Text', children: 'OUTER' }, { component: 'CanvasSlot', props: { canvasId: 'inner' } }] },
};

const region: ActionDefinition = {
  id: 'region',
  layout: { component: 'Text', children: 'INNER' },
};

const settle = () => new Promise((r) => setTimeout(r, 0));

const makeShell = () =>
  createShell({
    canvases: [
      { id: 'main', initial: 'arrangement' },
      { id: 'inner', initial: 'region' },
    ],
    actions: { arrangement, region },
    registry: createPermissiveRegistry(),
    layoutStore: createLayoutStore(),
    canvasLayout: { component: 'Box', children: [{ component: 'CanvasSlot', props: { canvasId: 'main' } }] },
  });

describe('a CanvasSlot inside an action layout', () => {
  it('stays a marker when the canvas that holds the action is flattened', async () => {
    const shell = makeShell();
    await settle();

    const tree = JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
    expect(tree).toContain('OUTER');
    expect(tree).toContain('"name":"CanvasSlot"');
    expect(tree).toContain('"canvasId":"inner"');
    // the inner canvas is NOT folded in — it is served as itself
    expect(tree).not.toContain('INNER');
    expect(JSON.stringify(shell.flattenRenderTree(shell.getCanvasRenderTree('inner')))).toContain('INNER');
    shell.dispose();
  });

  it('the frame\'s own slot is inlined, and the nested marker survives inside it', async () => {
    const shell = makeShell();
    await settle();

    const frame = JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree()));
    expect(frame).toContain('OUTER'); // main, inlined from the frame's slot
    expect(frame).toContain('"canvasId":"inner"'); // the action's slot, still a marker
    expect(frame).not.toContain('INNER');
    shell.dispose();
  });
});
