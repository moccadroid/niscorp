import { describe, it, expect, vi } from 'vitest';
import { createForwarder } from '../src/integrations/forward';
import { proxyRoutes } from '../src/integrations/forward';
import type { FoundIntegration } from '../src/integrations/registry';

const approved: FoundIntegration = { url: 'https://vendor.example/', status: 'approved', reach: {} };

const door = (answer: () => Response = () => new Response('{"received":true}', { status: 200 })) => {
  const send = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => answer());
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

  it('a hook sent chunked, or with `Expect`, `Keep-Alive` or `Upgrade`, reaches the vendor without them', async () => {
    const { routes, sent } = door();
    const answered = await routes.request('/integrations/pay/hook/stripe', {
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked', 'keep-alive': 'timeout=5', expect: '100-continue', upgrade: 'websocket', 'stripe-signature': 't=1,v1=abc', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(answered.status).toBe(200);

    const [call] = sent();
    for (const name of ['transfer-encoding', 'keep-alive', 'expect', 'upgrade']) expect(call?.headers.get(name)).toBeNull();
    expect(call?.headers.get('stripe-signature')).toBe('t=1,v1=abc');
    expect(call?.headers.get('content-type')).toBe('application/json');
    expect(call?.body).toBe('{}');
  });

  it('the body arrives byte for byte, at the path and the query the vendor called', async () => {
    const { routes, sent } = door();
    const body = '{ "b": 1,\n  "a": [2, 3] }';
    await routes.request('/integrations/pay/hook/stripe/events?live=1', { method: 'POST', body });
    expect(sent()).toEqual([expect.objectContaining({ url: 'https://vendor.example/hook/stripe/events?live=1', body })]);
  });
});

describe('the webhook door — what it keeps back, and how it serves the answer', () => {
  it('the visitor’s cookie, the operator key and proxy credentials do not reach the vendor', async () => {
    const { routes, sent } = door();
    await routes.request('/integrations/pay/hook/stripe', {
      method: 'POST',
      headers: { cookie: '__Host-nisc.token=st_SECRET', 'x-operator-key': 'the-key', 'proxy-authorization': 'Basic c2VjcmV0', 'stripe-signature': 't=1,v1=abc' },
      body: '{}',
    });
    const [call] = sent();
    for (const name of ['cookie', 'x-operator-key', 'proxy-authorization']) expect([name, call?.headers.get(name)]).toEqual([name, null]);
    expect(call?.headers.get('stripe-signature')).toBe('t=1,v1=abc');
  });

  it('a page the vendor answers keeps its type and body, served in a sandbox that is not the app’s origin', async () => {
    const { routes } = door(() => new Response('<script>alert(document.domain)</script>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const answered = await routes.request('/integrations/pay/hook/apple', { method: 'POST', body: 'code=1' });
    expect(answered.headers.get('content-type')).toBe('text/html');
    expect(await answered.text()).toBe('<script>alert(document.domain)</script>');
    const policy = answered.headers.get('content-security-policy') ?? '';
    for (const allowance of ['sandbox', 'allow-scripts', 'allow-forms', 'allow-popups', 'allow-top-navigation']) expect(policy.split(/\s+/)).toContain(allowance);
    expect(policy).not.toContain('allow-same-origin');
    expect(answered.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
