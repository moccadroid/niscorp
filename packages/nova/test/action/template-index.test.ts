import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import type { NovaError } from '@shared/errors';
import { createShell, shellIdle } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const list: ActionDefinition = {
  id: 'list',
  data: { items: ['a', 'b', 'c'], after: 'not yet', half: 1.5, word: 'two' },
  triggers: [
    { event: 'ui:click', ref: 'missing', do: [{ removeAt: 'items', index: '{{$.missing}}' }, { move: 'items', from: '{{$.missing}}', to: 0 }, { set: 'after', value: 'ran' }] },
    { event: 'ui:click', ref: 'odd', do: [{ removeAt: 'items', index: '{{$.half}}' }, { move: 'items', from: 0, to: '{{$.word}}' }, { set: 'after', value: 'ran' }] },
  ],
};

const clickOn = async (ref: string): Promise<{ data: Record<string, unknown> | undefined; errors: NovaError[] }> => {
  const errors: NovaError[] = [];
  const shell = createShell({ canvases: [{ id: 'main' }], registry: createPermissiveRegistry(), actions: { list }, onError: (error) => errors.push(error) });
  const id = shell.push('main', 'list');
  await shellIdle(shell);
  shell.dispatch({ type: 'ui:click', ref });
  await shellIdle(shell);
  return { data: shell.getRuntime(id)?.getData(), errors };
};

describe('an index template that does not resolve to a whole number', () => {
  it('leaves the list as it is and the steps after it run', async () => {
    const { data, errors } = await clickOn('missing');
    expect(errors).toEqual([]);
    expect(data?.['items']).toEqual(['a', 'b', 'c']);
    expect(data?.['after']).toBe('ran');
  });

  it('a fraction or a word is no index either', async () => {
    const { data, errors } = await clickOn('odd');
    expect(errors).toEqual([]);
    expect(data?.['items']).toEqual(['a', 'b', 'c']);
    expect(data?.['after']).toBe('ran');
  });
});
