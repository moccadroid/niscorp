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

  it('serializes object body with template resolution', async () => {
    const fetchFn: FetchFn = vi.fn(() => Promise.resolve(ok({})));
    await callEndpoint({
      endpoint: { url: '/x', method: 'POST', body: { name: '{{$.name}}' } },
      data: { name: 'Ada' },
      fetch: fetchFn,
    });
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error('no call');
    expect(call[1]).toMatchObject({ method: 'POST', body: '{"name":"Ada"}' });
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

  it('applies injected transform on success', async () => {
    const fetchFn: FetchFn = () => Promise.resolve(ok({ a: 1, b: 2 }));
    const transform = vi.fn(() => ({ shaped: true }));
    const result = await callEndpoint({
      endpoint: { url: '/x', method: 'GET', transform: { pick: 'a' } },
      data: {},
      fetch: fetchFn,
      transform,
    });
    expect(transform).toHaveBeenCalled();
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toEqual({ shaped: true });
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
