import { describe, expect, it } from 'vitest';
import type { ActionDefinition, FetchFn } from '@action';
import { createShell } from '@shell';

const later = (ms = 10): Promise<void> => new Promise((settle) => setTimeout(settle, ms));
const action: ActionDefinition = {
  id: 'a', data: { err: null },
  endpoints: { g: { url: '/x', method: 'GET', errorTarget: 'err' } },
  lifecycle: { mount: [{ call: 'g', onError: [] }] },
  layout: { component: 'Text', children: 'x' },
};

const errAfterMount = async (fetch: FetchFn, errors: unknown[] = []): Promise<unknown> => {
  const shell = createShell({ canvases: [{ id: 'main' }], actions: { a: action }, fetch, onError: (e) => errors.push(e) });
  const id = shell.push('main', 'a');
  await later();
  return shell.getRuntime(id)?.getData()['err'];
};

describe('a failed HTTP reply whose body is plain text', () => {
  it('reaches errorTarget as data', async () => {
    const err = await errAfterMount(async () => new Response('Service down for maintenance', { status: 503 }));
    expect(err).toEqual({ status: 503, message: 'HTTP 503', data: 'Service down for maintenance' });
  });

  it('a JSON body is read as before', async () => {
    const err = await errAfterMount(async () => new Response(JSON.stringify({ message: 'no seats' }), { status: 409 }));
    expect(err).toEqual({ status: 409, message: 'no seats', data: { message: 'no seats' } });
  });

  it('a reply whose body the host already read still fails as before, with nothing thrown', async () => {
    const errors: unknown[] = [];
    const err = await errAfterMount(async () => {
      const response = new Response('down', { status: 503 });
      await response.text();
      return response;
    }, errors);
    expect(err).toMatchObject({ status: 503, message: 'HTTP 503' });
    expect(errors).toEqual([]);
  });
});
