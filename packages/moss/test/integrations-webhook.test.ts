import { describe, it, expect, vi } from 'vitest';
import { createForwarder } from '../src/integrations/forward';
import { proxyRoutes } from '../src/integrations/proxy';
import type { FoundIntegration } from '../src/integrations/registry';

// THE WEBHOOK DOOR, AND WHAT IT HANDS ON (../src/integrations/proxy.ts). A
// vendor calls in with no session and no key; what reaches the integration is
// what the vendor sent, less the two headers that would lie on the other side.
//
// No database: the registry is a map, and the vendor's call is kept here
// instead of sent.

const approved: FoundIntegration = { url: 'https://vendor.example/', status: 'approved', reach: {}, frames: {} };

// The door, and every call it made to the integration's service.
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
  // A BEARER ARRIVING HERE MUST NOT READ AS ONE ON THE OTHER SIDE. Everywhere
  // else, what an integration finds in `Authorization` is an assertion this
  // deployment signed. This door mints none, so whatever a caller put there is
  // the caller's own: forwarded, a stranger chooses what the integration is
  // handed in the one header it reads identity from.
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
    // `Host` would name this app to the integration, and not the integration.
    expect(call?.headers.get('host')).toBeNull();
    // Nobody is asked about and nothing is signed: there is nobody to vouch for.
    expect(mint).not.toHaveBeenCalled();
  });

  // A signature is computed over exact bytes: a body read as JSON and written
  // out again has its keys in another order and verifies against nothing.
  it('the body arrives byte for byte, at the path and the query the vendor called', async () => {
    const { routes, sent } = door();
    const body = '{ "b": 1,\n  "a": [2, 3] }';
    await routes.request('/integrations/pay/hook/stripe/events?live=1', { method: 'POST', body });
    expect(sent()).toEqual([expect.objectContaining({ url: 'https://vendor.example/hook/stripe/events?live=1', body })]);
  });
});
