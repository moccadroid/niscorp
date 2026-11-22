import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import type { RenderNode } from '@layout';
import { createComponentRegistry } from '@layout';
import { createScopeChain, pushScope, resolve } from '@shared/bindings';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const texts = (nodes: RenderNode[]): string[] =>
  nodes.flatMap((node) => (node.type === 'text' ? [node.value] : node.type === 'component' || node.type === 'fragment' ? texts(node.children) : []));

describe('text that starts with $ but is no path', () => {
  const chain = createScopeChain({ secretNote: 'internal', amount: 5 });

  it('is text: a $ word followed by more words', () => {
    expect(resolve('$CAD only', chain)).toBe('$CAD only');
    expect(resolve('$USD only', chain)).toBe('$USD only');
  });

  it('a path is still a path', () => {
    expect(resolve('$.amount', chain)).toBe(5);
    expect(resolve('$amount', chain)).toBe(5);
    expect(resolve('$USD', chain)).toBeUndefined();
    expect(resolve('$', chain)).toEqual({ secretNote: 'internal', amount: 5 });
    expect(resolve('$amount ', chain)).toBeUndefined();
    const row = pushScope(chain, { item: { 'größe': 'L', 'prénom': 'Zoé' } });
    expect(resolve('$item.größe', row)).toBe('L');
    expect(resolve('$item.prénom', row)).toBe('Zoé');
    expect(resolve('{{$}}', chain)).toEqual({ secretNote: 'internal', amount: 5 });
  });

  it('renders as written and is offered to the phrasebook', async () => {
    const registry = createComponentRegistry();
    registry.registerAll({ Text: () => null });
    const missed: string[] = [];
    const price: ActionDefinition = { id: 'price', layout: { component: 'Text', children: '$CAD only' } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { price }, registry, phrases: {}, onPhraseMiss: (phrase) => missed.push(phrase) });
    const id = shell.push('main', 'price');
    await later();
    expect(texts(shell.getRuntime(id)?.render() ?? [])).toEqual(['$CAD only']);
    expect(missed).toContain('$CAD only');
  });
});
