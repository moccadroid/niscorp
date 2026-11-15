import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell, reconcileCanvas, shellIdle } from '@shell';
import type { Shell } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const form: ActionDefinition = { id: 'form', data: { title: '', note: '' }, layout: { component: 'Text', children: 'f' } };

const sideRuntime = (shell: Shell) => shell.getRuntime(shell.getCanvasState('side').active?.id ?? '');

describe('reconcileCanvas with a lastInputs map', () => {
  it('keeps what was typed, and writes only the input key whose row changed', async () => {
    const shell = createShell({ canvases: [{ id: 'side' }], registry: createPermissiveRegistry(), actions: { form } });
    const options = { origin: 'host', lastInputs: new Map<string, Record<string, unknown>>() };
    reconcileCanvas(shell, 'side', [{ actionId: 'form', input: { title: 'T', note: 'N' } }], options);
    await shellIdle(shell);
    const runtime = sideRuntime(shell);
    runtime?.setData({ ...runtime.getData(), title: 'typed title', note: 'typed note' });
    reconcileCanvas(shell, 'side', [{ actionId: 'form', input: { title: 'T', note: 'N' } }], options);
    expect(runtime?.getData()).toMatchObject({ title: 'typed title', note: 'typed note' });
    reconcileCanvas(shell, 'side', [{ actionId: 'form', input: { title: 'U', note: 'N' } }], options);
    expect(runtime?.getData()).toMatchObject({ title: 'U', note: 'typed note' });
  });

  it('a partial input then a full one does not re-open a card nothing changed in', async () => {
    const loader: ActionDefinition = {
      id: 'loader',
      input: { type: 'object', properties: { id: { type: 'number' }, date: { type: 'string' } } },
      data: { id: 0, date: '', row: null },
      endpoints: { load: { url: '/x', method: 'POST', request: { id: { $ref: '$.id' } }, target: 'row' } },
      lifecycle: { mount: [{ call: 'load' }] },
      layout: { component: 'Text', children: 'l' },
    };
    const plain: ActionDefinition = { id: 'loader', data: { id: 0, date: '' }, layout: { component: 'Text', children: 'l' } };
    const shell = createShell({ canvases: [{ id: 'c' }], registry: createPermissiveRegistry(), actions: { loader: plain } });
    const options = { origin: 'intent', own: 'canvas' as const, definitionOf: (actionId: string) => (actionId === 'loader' ? loader : undefined), lastInputs: new Map<string, Record<string, unknown>>() };
    reconcileCanvas(shell, 'c', [{ actionId: 'loader', input: { id: 1, date: 'tue' } }], options);
    await shellIdle(shell);
    const first = shell.getCanvasState('c').active?.id;
    reconcileCanvas(shell, 'c', [{ actionId: 'loader', input: { date: 'wed' } }], options);
    reconcileCanvas(shell, 'c', [{ actionId: 'loader', input: { id: 1, date: 'wed' } }], options);
    expect(shell.getCanvasState('c').active?.id).toBe(first);
  });

  it('without the map, puts the rows back over what was typed, as before', async () => {
    const shell = createShell({ canvases: [{ id: 'side' }], registry: createPermissiveRegistry(), actions: { form } });
    reconcileCanvas(shell, 'side', [{ actionId: 'form', input: { title: 'T' } }], { origin: 'host' });
    await shellIdle(shell);
    const runtime = sideRuntime(shell);
    runtime?.setData({ ...runtime.getData(), title: 'typed title' });
    reconcileCanvas(shell, 'side', [{ actionId: 'form', input: { title: 'T' } }], { origin: 'host' });
    expect(runtime?.getData()['title']).toBe('T');
  });
});

describe('the reconcile step with keepTyped', () => {
  const host = (keepTyped?: boolean): ActionDefinition => ({
    id: 'host',
    data: { rows: [{ id: 'form', input: { title: 'T' } }] },
    triggers: [{ message: 'sync', do: [{ reconcile: { to: '$.rows', action: 'id', input: 'input', canvas: 'side', ...(keepTyped === undefined ? {} : { keepTyped }) } }] }],
  });

  const typedTitleAfterSecondRun = async (keepTyped?: boolean): Promise<unknown> => {
    const shell = createShell({ canvases: [{ id: 'main', initial: 'host' }, { id: 'side' }], registry: createPermissiveRegistry(), actions: { host: host(keepTyped), form } });
    await shellIdle(shell);
    const sync = (): void => shell.publish('sync');
    sync();
    await shellIdle(shell);
    const runtime = sideRuntime(shell);
    runtime?.setData({ ...runtime.getData(), title: 'typed title' });
    sync();
    await shellIdle(shell);
    return sideRuntime(shell)?.getData()['title'];
  };

  it('keeps what was typed when the step runs again with the same rows', async () => {
    expect(await typedTitleAfterSecondRun(true)).toBe('typed title');
  });

  it('without it, or set false, puts the row back, as before', async () => {
    expect(await typedTitleAfterSecondRun()).toBe('T');
    expect(await typedTitleAfterSecondRun(false)).toBe('T');
  });
});
