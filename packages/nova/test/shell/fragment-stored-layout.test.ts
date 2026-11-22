import { describe, expect, it } from 'vitest';
import type { ActionDefinition, ActionFragment } from '@action';
import { createShell } from '@shell';
import type { RenderNode } from '@layout';
import { createComponentRegistry, createLayoutStore } from '@layout';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const texts = (nodes: RenderNode[]): string[] =>
  nodes.flatMap((node) => (node.type === 'text' ? [node.value] : node.type === 'component' || node.type === 'fragment' ? texts(node.children) : []));

describe('a fragment around an action whose layout is a stored layout id', () => {
  it('renders the stored layout in the slot', async () => {
    const registry = createComponentRegistry();
    registry.registerAll({ Stack: () => null, Text: () => null });
    const layoutStore = createLayoutStore();
    layoutStore.set('invoice-body', { component: 'Text', children: 'Invoice {{$.n}}' });
    const invoice: ActionDefinition = { id: 'invoice', data: { n: 7 }, layout: 'invoice-body' };
    const frame: ActionFragment = { id: 'frame', kind: 'fragment', layout: { component: 'Stack', children: [{ component: 'Text', children: 'Frame' }, { slot: 'body' }] } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { invoice }, fragments: { frame }, registry, layoutStore });
    const id = shell.push('main', 'invoice', undefined, ['frame']);
    await later();
    expect(texts(shell.getRuntime(id)?.render() ?? [])).toEqual(['Frame', 'Invoice 7']);
  });
});
