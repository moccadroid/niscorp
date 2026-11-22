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

describe('a model written $.<loop name> inside a loop', () => {
  const cart: ActionDefinition = {
    id: 'cart',
    data: { lines: [{ qty: 1 }, { qty: 1 }], other: '' },
    layout: { component: 'Stack', children: [{ for: '$.lines', as: 'line', do: [{ component: 'Input', model: '$.line.qty' }, { component: 'Input', model: '$.index' }, { component: 'Input', model: '$.other' }] }] },
  };

  it('binds the row it shows, binds nothing for $.index, and binds the root for any other name', async () => {
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const tree = JSON.stringify(shell.getRuntime(id)?.render());
    expect(tree).toContain('"path":"lines.0.qty"');
    expect(tree).toContain('"path":"lines.1.qty"');
    expect(tree).not.toContain('"path":"index"');
    expect(tree).not.toContain('"path":"line.qty"');
    expect(tree).toContain('"path":"other"');
  });

  it('typing in a row writes that row', async () => {
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { cart }, registry: registry() });
    const id = shell.push('main', 'cart');
    await later();
    const runtime = shell.getRuntime(id);
    runtime?.render();
    shell.dispatch({ type: 'ui:model', ref: 'auto-Input-lines.1.qty', origin: id, payload: 4 });
    await later();
    expect(runtime?.getData()['lines']).toEqual([{ qty: 1 }, { qty: 4 }]);
    expect(runtime?.getData()['line']).toBeUndefined();
  });
});
