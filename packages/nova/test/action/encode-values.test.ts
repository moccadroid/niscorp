import { describe, expect, it } from 'vitest';
import type { ActionDefinition, FetchFn } from '@action';
import { createShell, shellIdle } from '@shell';
import { createPermissiveRegistry } from '../helpers';

const urlsCalled = async (url: string, encodeValues?: boolean, data: Record<string, unknown> = { picked: '../users/42' }): Promise<string[]> => {
  const urls: string[] = [];
  const fetch: FetchFn = (called) => {
    urls.push(called);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
  };
  const note: ActionDefinition = {
    id: 'note',
    data,
    endpoints: { remove: { url, method: 'DELETE', ...(encodeValues === undefined ? {} : { encodeValues }) } },
    lifecycle: { mount: [{ call: 'remove' }] },
  };
  const shell = createShell({ canvases: [{ id: 'main' }], registry: createPermissiveRegistry(), actions: { note }, fetch });
  shell.push('main', 'note');
  await shellIdle(shell);
  return urls;
};

describe('encodeValues on an HTTP endpoint', () => {
  it('encodes each value put into the url', async () => {
    expect(await urlsCalled('/api/notes/{{$.picked}}', true)).toEqual(['/api/notes/..%2Fusers%2F42']);
    expect(await urlsCalled('/api/notes/{{$.id}}?q={{$.q}}', true, { id: '7?cascade=all', q: 'a&b' })).toEqual(['/api/notes/7%3Fcascade%3Dall?q=a%26b']);
  });

  it('leaves a url that is a single binding as it is', async () => {
    expect(await urlsCalled('{{$.base}}', true, { base: 'https://x.test/a b' })).toEqual(['https://x.test/a b']);
    expect(await urlsCalled('$.base', true, { base: '/api/notes/1' })).toEqual(['/api/notes/1']);
  });

  it('without it, puts values in as they are', async () => {
    expect(await urlsCalled('/api/notes/{{$.picked}}')).toEqual(['/api/notes/../users/42']);
  });

  it('set false, puts values in as they are', async () => {
    expect(await urlsCalled('/api/notes/{{$.picked}}', false)).toEqual(['/api/notes/../users/42']);
  });
});
