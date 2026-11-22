import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));

describe('a failure that comes back after a newer call of the same endpoint', () => {
  it('does not write errorTarget when the newer call already came back', async () => {
    let n = 0;
    const functions = {
      search: async (data: Record<string, unknown>) => {
        n += 1;
        if (n === 1) {
          await later(50);
          throw new Error('first search failed late');
        }
        return [`row for ${String(data['q'])}`];
      },
    };
    const s: ActionDefinition = {
      id: 's', data: { q: '', rows: [], err: null },
      endpoints: { find: { fn: 'search', target: 'rows', errorTarget: 'err' } },
      triggers: [{ event: 'ui:click', ref: 'go', do: [{ set: 'err', value: null }, { call: 'find' }] }],
      layout: { component: 'Button', ref: 'go', children: 'go' },
    };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { s }, functions });
    const id = shell.push('main', 's');
    await later();
    const runtime = shell.getRuntime(id);
    runtime?.setData({ ...runtime.getData(), q: 'a' });
    shell.dispatch({ type: 'ui:click', ref: 'go' });
    await later(1);
    runtime?.setData({ ...runtime.getData(), q: 'ab' });
    shell.dispatch({ type: 'ui:click', ref: 'go' });
    await later(80);
    expect(runtime?.getData()['rows']).toEqual(['row for ab']);
    expect(runtime?.getData()['err']).toBeNull();
  });

  it('still writes errorTarget when the newer call is still on its way', async () => {
    let n = 0;
    const functions = {
      save: async () => {
        n += 1;
        if (n === 1) {
          await later(30);
          throw new Error('row 1 was not saved');
        }
        await later(60);
        return { ok: true };
      },
    };
    const list: ActionDefinition = {
      id: 'list', data: { err: null, saved: null },
      endpoints: { save: { fn: 'save', target: 'saved', errorTarget: 'err' } },
      triggers: [{ event: 'ui:click', ref: 'save', do: [{ call: 'save' }] }],
      layout: { component: 'Button', ref: 'save', children: 's' },
    };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { list }, functions });
    const id = shell.push('main', 'list');
    await later();
    shell.dispatch({ type: 'ui:click', ref: 'save', payload: 1 });
    shell.dispatch({ type: 'ui:click', ref: 'save', payload: 2 });
    await later(45);
    expect(shell.getRuntime(id)?.getData()['err']).toMatchObject({ message: 'row 1 was not saved' });
  });
});
