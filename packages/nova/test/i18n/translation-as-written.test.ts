import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import type { RenderNode } from '@layout';
import { createComponentRegistry } from '@layout';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const texts = (nodes: RenderNode[]): string[] =>
  nodes.flatMap((node) => (node.type === 'text' ? [node.value] : node.type === 'component' || node.type === 'fragment' ? texts(node.children) : []));

describe('a translation of text with spaces around it', () => {
  it('is put in as written, dollar patterns included', async () => {
    const registry = createComponentRegistry();
    registry.registerAll({ Stack: () => null, Text: () => null });
    const p: ActionDefinition = { id: 'p', layout: { component: 'Stack', children: [{ component: 'Text', children: 'Price in dollars ' }, { component: 'Text', children: ' Total ' }] } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { p }, registry, phrases: { 'Price in dollars': 'Preis in US$$', Total: "Summe $& $' $1" } });
    const id = shell.push('main', 'p');
    await later();
    expect(texts(shell.getRuntime(id)?.render() ?? [])).toEqual(['Preis in US$$ ', " Summe $& $' $1 "]);
  });
});
