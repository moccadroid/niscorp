import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const failing = { save: async (): Promise<never> => { throw new Error('disk full'); } };

const run = async (a: ActionDefinition, strict: boolean, refs: string[]): Promise<string[]> => {
  const seen: string[] = [];
  const shell = createShell({ canvases: [{ id: 'main' }], actions: { a }, strict, functions: failing, onError: (e) => seen.push(`${e.code}: ${e.message}`) });
  shell.push('main', 'a');
  await later();
  for (const ref of refs) shell.dispatch({ type: 'ui:click', ref });
  await later();
  return seen;
};

describe('a failed call in a trigger that nothing takes', () => {
  const a: ActionDefinition = {
    id: 'a',
    endpoints: { save: { fn: 'save' } },
    triggers: [{ event: 'ui:click', ref: 'go', do: [{ call: 'save' }] }, { event: 'ui:click', ref: 'typo', do: [{ call: 'svae' }] }],
    layout: { component: 'Button', ref: 'go', children: 'x' },
  };

  it('is reported to onError in strict mode, a mistyped endpoint name too', async () => {
    expect((await run(a, true, ['go', 'typo'])).sort()).toEqual(["ENDPOINT_FAILED: endpoint 'save' failed: disk full", 'ENDPOINT_FAILED: unknown endpoint: svae']);
  });

  it('is not reported outside strict mode, as before', async () => {
    expect(await run(a, false, ['go', 'typo'])).toEqual([]);
  });

  it('is not reported when an errorTarget or onError steps take it', async () => {
    const taken: ActionDefinition = {
      id: 'a', data: { err: null },
      endpoints: { save: { fn: 'save', errorTarget: 'err' } },
      triggers: [{ event: 'ui:click', ref: 'go', do: [{ call: 'save' }] }, { event: 'ui:click', ref: 'typo', do: [{ call: 'svae', onError: [] }] }],
      layout: { component: 'Button', ref: 'go', children: 'x' },
    };
    expect(await run(taken, true, ['go', 'typo'])).toEqual([]);
  });
});
