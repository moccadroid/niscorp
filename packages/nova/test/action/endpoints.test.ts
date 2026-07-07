import { describe, expect, it, vi } from 'vitest';
import { callEndpoint } from '@action/runtime/endpoints';
import type { FetchFn, FetchResponse } from '@action/types';

const ok = (data: unknown, status = 200): FetchResponse => ({
  ok: true,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
});

const fail = (data: unknown, status = 500): FetchResponse => ({
  ok: false,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

describe('callEndpoint', () => {
  it('templates the URL from data', async () => {
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(ok({ id: 1 })));
    await callEndpoint({
      endpoint: { url: '/api/users/{{$.id}}', method: 'GET' },
      data: { id: 'u1' },
      fetch: fetchFn,
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/users/u1', expect.objectContaining({ method: 'GET' }));
  });

  it('builds the request body via the injected transform', async () => {
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(ok({})));
    const transform = vi.fn((_config: unknown, source: unknown) => ({ name: (source as { name: string }).name }));
    await callEndpoint({
      endpoint: { url: '/x', method: 'POST', request: { name: { ref: '$.name' } } },
      data: { name: 'Ada' },
      fetch: fetchFn,
      transform,
    });
    expect(transform).toHaveBeenCalledWith({ name: { ref: '$.name' } }, { name: 'Ada' });
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error('no call');
    expect(call[1]).toMatchObject({ method: 'POST', body: '{"name":"Ada"}' });
  });

  it('errors when `request` is declared but no transform is injected', async () => {
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(ok({})));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'POST', request: { a: 1 } },
      data: {},
      fetch: fetchFn,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.message).toMatch(/request/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns ok result on success', async () => {
    const fetchFn: FetchFn = () => Promise.resolve(ok({ value: 7 }));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET' },
      data: {},
      fetch: fetchFn,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toEqual({ value: 7 });
  });

  it('returns error result on failure', async () => {
    const fetchFn: FetchFn = () => Promise.resolve(fail({ message: 'nope' }, 400));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET' },
      data: {},
      fetch: fetchFn,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.status).toBe(400);
    expect(result.error.message).toBe('nope');
  });

  it('shapes the response via the injected transform', async () => {
    const fetchFn: FetchFn = () => Promise.resolve(ok({ a: 1, b: 2 }));
    const transform = vi.fn(() => ({ shaped: true }));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET', response: { pick: 'a' } },
      data: {},
      fetch: fetchFn,
      transform,
    });
    expect(transform).toHaveBeenCalledWith({ pick: 'a' }, { a: 1, b: 2 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toEqual({ shaped: true });
  });

  it('errors when `response` is declared but no transform is injected', async () => {
    const fetchFn: FetchFn = () => Promise.resolve(ok({ a: 1 }));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET', response: { pick: 'a' } },
      data: {},
      fetch: fetchFn,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.message).toMatch(/response/);
  });

  it('handles fetch throwing', async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error('network'));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET' },
      data: {},
      fetch: fetchFn,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.message).toBe('network');
  });
});
