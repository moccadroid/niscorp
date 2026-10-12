import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { authentication } from '../src/server/routes';
import type { AuthenticationDeps } from '../src/server/routes';
import type { Env } from '../src/server/moss-server';
import type { ResolvedIdentity } from '../src/identity';

const resolved = (roles: readonly string[]): ResolvedIdentity => ({ roles, scope: {}, installed: undefined, memoKey: roles.join(',') });

const serverWith = (over: Partial<AuthenticationDeps> = {}): Hono<Env> => {
  const server = new Hono<Env>();
  server.use(
    '*',
    authentication({
      session: (token) => (token === 'good' ? 'usr_1' : null),
      credentials: [],
      resolve: async (principal) => resolved(principal === null ? ['public'] : ['member']),
      ...over,
    }),
  );
  server.get('/who', (c) => c.json({ principal: c.get('principal'), roles: c.get('resolved').roles }));
  return server;
};

const asked = async (server: Hono<Env>, token?: string): Promise<Response> => server.request('/who', token === undefined ? {} : { headers: { Authorization: `Bearer ${token}` } });

describe('authentication — who is calling', () => {
  it('no header is nobody signed in, which is a principal and not an error', async () => {
    const answer = await asked(serverWith());
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ principal: null, roles: ['public'] });
  });

  it('a token that resolves is that principal, resolved once for everything behind', async () => {
    const resolve = vi.fn(async (principal: string | null) => resolved(principal === null ? ['public'] : ['member']));
    const answer = await asked(serverWith({ resolve }), 'good');
    expect(await answer.json()).toEqual({ principal: 'usr_1', roles: ['member'] });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('a token that is nobody’s is refused: 401, and never served as nobody', async () => {
    const answer = await asked(serverWith(), 'stale');
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('a feature’s own credential says who its token is, or what to answer instead', async () => {
    const credentials: AuthenticationDeps['credentials'] = [
      { prefix: 'ik_', principalOf: async (token) => (token === 'ik_live' ? { principal: 'integration@studio' } : { refused: { status: 403, error: 'forbidden', message: 'No.' } }) },
    ];
    const admitted = await asked(serverWith({ credentials }), 'ik_live');
    expect(await admitted.json()).toEqual({ principal: 'integration@studio', roles: ['member'] });
    const refused = await asked(serverWith({ credentials }), 'ik_other');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'forbidden', message: 'No.' });
  });
});

describe('authentication — who is calling could not be found out', () => {
  const INTERNAL = 'connect ECONNREFUSED 10.1.2.3:5432';
  const failing = async (): Promise<never> => {
    throw new Error(INTERNAL);
  };

  it.each([
    ['who the principal is cannot be resolved', (): Hono<Env> => serverWith({ resolve: failing }), 'good'],
    ['the verifier cannot be asked', (): Hono<Env> => serverWith({ session: failing }), 'good'],
    ['a feature’s credential cannot be read', (): Hono<Env> => serverWith({ credentials: [{ prefix: 'ik_', principalOf: failing }] }), 'ik_live'],
    ['a feature’s principal cannot be resolved', (): Hono<Env> => serverWith({ credentials: [{ prefix: 'ik_', principalOf: async () => ({ principal: 'integration@studio' }) }], resolve: failing }), 'ik_live'],
  ])('%s: answered 500 and logged, not 401, and nothing of why is sent', async (_label, server, token) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const answer = await asked(server(), token);
    expect(answer.status).toBe(500);
    const body = await answer.text();
    expect(JSON.parse(body)).toEqual({ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' });
    expect(body).not.toContain('ECONNREFUSED');
    expect(logged.mock.calls.some((call) => call.some((part) => part instanceof Error && part.message === INTERNAL))).toBe(true);
    logged.mockRestore();
  });

  it('a route that throws is not the authentication’s to answer: it is the route’s failure, as before', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = serverWith();
    server.get('/broken', () => {
      throw new Error('the route itself');
    });
    const answer = await server.request('/broken');
    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain('identity_failed');
    logged.mockRestore();
  });
});
