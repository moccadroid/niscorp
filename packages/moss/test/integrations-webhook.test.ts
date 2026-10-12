import { describe, it, expect, vi } from 'vitest';
import { createForwarder } from '../src/integrations/forward';
import { proxyRoutes } from '../src/integrations/forward';
import type { FoundIntegration } from '../src/integrations/registry';

const approved: FoundIntegration = { url: 'https://vendor.example/', status: 'approved', reach: {} };

const door = () => {
  const send = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{"received":true}', { status: 200 }));
  const mint = vi.fn(() => 'an-assertion');
  const routes = proxyRoutes({
    grantedActionIds: () => [],
    forward: createForwarder({
      find: async (id) => (id === 'pay' ? approved : undefined),
      resolveIdentity: async () => ({ roles: [], installed: undefined }),
      scopeOf: async () => ({}),
      mint,
      timeoutMs: 30_000,
      fetch: send,
    }),
  });
  const sent = (): { url: string; headers: Headers; body: string }[] =>
    send.mock.calls.map(([url, init]) => ({
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body instanceof ArrayBuffer ? new TextDecoder().decode(init.body) : '(not the bytes that arrived)',
    }));
  return { routes, sent, mint };
};

describe('the webhook door — what it hands on', () => {
  it('the vendor’s headers travel, and `Authorization` and `Host` do not', async () => {
    const { routes, sent, mint } = door();
    const answered = await routes.request('/integrations/pay/hook/stripe', {
      method: 'POST',
      headers: { authorization: 'Bearer chosen-by-the-caller', host: 'app.example', 'stripe-signature': 't=1,v1=abc', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(answered.status).toBe(200);

    const [call] = sent();
    expect(call?.headers.get('stripe-signature')).toBe('t=1,v1=abc');
    expect(call?.headers.get('content-type')).toBe('application/json');
    expect(call?.headers.get('authorization')).toBeNull();
    expect(call?.headers.get('host')).toBeNull();
    expect(mint).not.toHaveBeenCalled();
  });

  it('the body arrives byte for byte, at the path and the query the vendor called', async () => {
    const { routes, sent } = door();
    const body = '{ "b": 1,\n  "a": [2, 3] }';
    await routes.request('/integrations/pay/hook/stripe/events?live=1', { method: 'POST', body });
    expect(sent()).toEqual([expect.objectContaining({ url: 'https://vendor.example/hook/stripe/events?live=1', body })]);
  });
});
