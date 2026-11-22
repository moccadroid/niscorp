import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import { createComponentRegistry } from '@layout';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const registry = () => {
  const r = createComponentRegistry();
  r.registerAll({ Stack: () => null, Input: () => null });
  return r;
};

describe('for and model written as a single {{…}}', () => {
  it('a model inside a loop written that way stays two-way bound to its row', async () => {
    const cart: ActionDefinition = { id: 'cart', data: { lines: [{ qty: 1 }, { qty: 1 }] }, layout: { component: 'Stack', children: { for: '{{$.lines}}', as: 'line', do: { component: 'Input', model: '{{$line.qty}}' } } } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const tree = JSON.stringify(shell.getRuntime(id)?.render());
    expect(tree).toContain('"path":"lines.0.qty"');
    expect(tree).toContain('"path":"lines.1.qty"');
  });

  it('a model at the root written that way writes what is typed', async () => {
    const form: ActionDefinition = { id: 'form', data: { q: '' }, layout: { component: 'Input', model: '{{$.q}}' } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { form }, registry: registry() });
    const id = shell.push('main', 'form');
    await later();
    const runtime = shell.getRuntime(id);
    runtime?.render();
    shell.dispatch({ type: 'ui:model', ref: 'auto-Input-q', origin: id, payload: 'abc' });
    await later();
    expect(runtime?.getData()['q']).toBe('abc');
  });
});
