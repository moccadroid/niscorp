import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import type { NovaError } from '@shared/errors';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));

const rowsAfterClick = async (index: number | string): Promise<{ rows: unknown; seen: NovaError[] }> => {
  const seen: NovaError[] = [];
  const a: ActionDefinition = {
    id: 'a', data: { rows: [1, 2, 3], found: -1 },
    triggers: [{ event: 'ui:click', ref: 'go', do: [{ removeAt: 'rows', index }] }],
    layout: { component: 'Button', ref: 'go', children: 'x' },
  };
  const shell = createShell({ canvases: [{ id: 'main' }], actions: { a }, onError: (e) => seen.push(e) });
  const id = shell.push('main', 'a');
  await later();
  shell.dispatch({ type: 'ui:click', ref: 'go' });
  await later();
  return { rows: shell.getRuntime(id)?.getData()['rows'], seen };
};

describe('a removeAt index that a template turns negative', () => {
  it('is reported, then applied as before', async () => {
    const { rows, seen } = await rowsAfterClick('{{$.found}}');
    expect(rows).toEqual([1, 2]);
    expect(seen.map((e) => `${e.code}: ${e.message}`)).toEqual(['MUTATION_ERROR: removeAt: index {{$.found}} resolved to -1, which counts from the end (-1 removes the last element)']);
  });

  it('a literal negative index is not reported', async () => {
    const { rows, seen } = await rowsAfterClick(-1);
    expect(rows).toEqual([1, 2]);
    expect(seen).toEqual([]);
  });
});
