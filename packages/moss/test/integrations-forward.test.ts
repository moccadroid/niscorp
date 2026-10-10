import { describe, it, expect, vi } from 'vitest';
import { createForwarder } from '../src/integrations/forward';
import type { ForwardDeps } from '../src/integrations/forward';
import type { FoundIntegration } from '../src/integrations/registry';
import { neverAnswers } from './never-answers';

// THE ONE WAY OUT to an integration's service, driven by itself: the registry
// is a map, who somebody is and what they carry are said here, and nothing is
// sent anywhere. What each door does with the answer is the door's.

const acme: FoundIntegration = { url: 'https://acme.example/', status: 'approved', reach: {}, frames: {} };

const world = (over: Partial<ForwardDeps> & { rows?: Record<string, FoundIntegration> } = {}) => {
  const rows = over.rows ?? { acme };
  const send = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }));
  const mint = vi.fn((claims: { integration: string; principal: string; scope: Record<string, unknown> }) => `signed:${JSON.stringify(claims)}`);
  const who = vi.fn(async () => ({ roles: ['desk'], installed: ['acme'] as readonly string[] | undefined }));
  const forward = createForwarder({
    find: async (id) => rows[id],
    who,
    scopeOf: async () => ({ userId: 'i_mara', studioId: 's_1' }),
    mint,
    // As long as a deployment allows a call when it says nothing else.
    timeoutMs: 30_000,
    fetch: send,
    ...over,
  });
  return { forward, send, mint, who };
};

const get = (assertion: string): RequestInit => ({ headers: { authorization: `Bearer ${assertion}` } });

describe('createForwarder — what is refused, and that nothing went out', () => {
  it('no such integration', async () => {
    const { forward, send, mint } = world();
    expect(await forward({ integration: 'ghost', principal: 'i_mara', path: 'x', request: get })).toEqual({ kind: 'refused', why: 'unknown' });
    expect(send).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it('one nobody approved, with what its row says', async () => {
    const { forward, send, who } = world({ rows: { acme: { ...acme, status: 'pending' } } });
    expect(await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get })).toEqual({ kind: 'refused', why: 'unapproved', status: 'pending' });
    // Not approved is said before anybody is asked who the caller is.
    expect(who).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('one that is not installed for the principal’s tenant', async () => {
    const { forward, send, mint } = world({ who: async () => ({ roles: ['desk'], installed: ['somebody-else'] }) });
    expect(await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get })).toEqual({ kind: 'refused', why: 'uninstalled' });
    expect(send).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });

  it('an app that keeps no install list admits', async () => {
    const { forward } = world({ who: async () => ({ roles: ['desk'], installed: undefined }) });
    expect((await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get })).kind).toBe('answered');
  });

  it('a call the door’s own gate does not admit gets no credential', async () => {
    const { forward, send, mint } = world();
    const admits = vi.fn(() => false);
    expect(await forward({ integration: 'acme', principal: 'i_mara', path: 'x', admits, request: get })).toEqual({ kind: 'refused', why: 'inadmissible' });
    // The gate is handed the row and who the caller is, to decide by.
    expect(admits).toHaveBeenCalledWith(acme, { roles: ['desk'], installed: ['acme'] });
    expect(mint).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createForwarder — a call that goes out', () => {
  it('for somebody: an assertion says who, with the deployment’s own values laid over theirs', async () => {
    const { forward, send, mint } = world();
    const ended = await forward({
      integration: 'acme',
      principal: 'i_mara',
      scope: { studioId: 's_2', reason: 'gdpr' },
      path: 'lifecycle/erase?hard=1',
      request: (assertion) => ({ method: 'POST', headers: { authorization: `Bearer ${assertion}` }, body: '{}' }),
    });

    expect(ended.kind).toBe('answered');
    expect(mint).toHaveBeenCalledWith({ integration: 'acme', principal: 'i_mara', scope: { userId: 'i_mara', studioId: 's_2', reason: 'gdpr' } });
    // The path goes under the service's address, whether or not that ends in a slash.
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe('https://acme.example/lifecycle/erase?hard=1');
    // As the door built it, and with the signal that ends a call that takes too long.
    expect(init).toEqual({ method: 'POST', headers: { authorization: `Bearer ${mint.mock.results[0]?.value}` }, body: '{}', signal: expect.any(AbortSignal) });
  });

  it('for nobody: nobody is asked about, nothing is minted, and the request goes as the door built it', async () => {
    const { forward, send, mint, who } = world();
    const headers = new Headers({ 'stripe-signature': 't=1,v1=abc' });
    const body = new TextEncoder().encode('{"a":1,"b":2}').buffer;
    const admits = vi.fn(() => true);
    const ended = await forward({ integration: 'acme', admits, path: 'hook/stripe', request: () => ({ method: 'POST', headers, body }) });

    expect(ended.kind).toBe('answered');
    expect(who).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
    expect(admits).toHaveBeenCalledWith(acme);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe('https://acme.example/hook/stripe');
    // The very objects: the bytes a vendor signed are not copied or re-read.
    expect(init?.headers).toBe(headers);
    expect(init?.body).toBe(body);
  });

  it('hands back what the service answered, whatever it answered', async () => {
    const answer = new Response('no', { status: 409 });
    const { forward } = world({ fetch: async () => answer });
    const ended = await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get });
    expect(ended).toEqual({ kind: 'answered', response: answer });
  });

  it('a service that does not answer is unreachable, with the error it failed by', async () => {
    const down = new Error('ECONNREFUSED');
    const { forward } = world({
      fetch: async () => {
        throw down;
      },
    });
    expect(await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get })).toEqual({ kind: 'unreachable', error: down });
  });

  it('a request that cannot be built is a call that did not go out', async () => {
    const unread = new Error('the body could not be read');
    const { forward, send } = world();
    const ended = await forward({
      integration: 'acme',
      principal: 'i_mara',
      path: 'x',
      request: async () => {
        throw unread;
      },
    });
    expect(ended).toEqual({ kind: 'unreachable', error: unread });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createForwarder — a service that never answers', () => {
  const how = (ended: Awaited<ReturnType<ReturnType<typeof createForwarder>>>): string => (ended.kind === 'unreachable' ? String(ended.error) : ended.kind);

  it('is given up on once the call has taken as long as the deployment allows, and reads as unreachable', async () => {
    const service = neverAnswers();
    const { forward } = world({ fetch: service.fetch, timeoutMs: 20 });
    expect(how(await forward({ integration: 'acme', principal: 'i_mara', path: 'x', request: get }))).toMatch(/^TimeoutError/);
  });

  it('whoever the call is for: a vendor’s webhook is given up on the same way', async () => {
    const service = neverAnswers();
    const { forward } = world({ fetch: service.fetch, timeoutMs: 20 });
    expect(how(await forward({ integration: 'acme', path: 'hook/stripe', request: () => ({ method: 'POST', body: '{}' }) }))).toMatch(/^TimeoutError/);
  });
});
