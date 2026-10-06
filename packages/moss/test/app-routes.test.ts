import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { defineApp } from '../src/app';
import { createServer } from '../src/server';
import { mintDevToken } from '../src/runtime';

// ═══════════════════════════════════════════════════════════════
// A ROUTE THE APP ADDS KNOWS WHO IS ASKING. The server is a hono app, and an
// app mounts routes of its own on it after it is built — where a file picker
// sends a file, for one: a file never goes over the socket (AGENTS.md rule
// 9a), so the bytes arrive at a route like these.
//
// Such a route reads the principal off the context exactly as moss's own
// surfaces do, and that holds only because the identity middleware is
// registered on `*` inside createServer, ahead of anything an app can add.
// Apps rely on it and nothing here held it: had the middleware moved onto
// moss's own prefixes, an app's route would have read nobody for everybody.
// ═══════════════════════════════════════════════════════════════

// 'dev-open' and PGlite each announce themselves at boot; neither line is this test.
const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return await run();
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
};

const boot = async () => {
  const pool = createPglitePool(new PGlite());
  const app = defineApp({ charter: { public: [], staff: [] }, assignments: { usr_staff: ['staff'] }, actions: {} });
  const server = await quietly(() => createServer(app, { pool, db: pool, session: 'dev-open' }));
  const reached = { times: 0 };
  // The app's own routes, added the way an app adds them: to the built server.
  server.get('/who', (c) => {
    reached.times += 1;
    return c.json({ principal: c.get('principal'), roles: c.get('resolved').roles });
  });
  server.post('/files', async (c) => {
    reached.times += 1;
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    return c.json({ principal: c.get('principal'), type: c.req.header('content-type') ?? '', bytes: [...bytes] });
  });
  return { server, reached };
};

const as = (principal: string): Record<string, string> => ({ Authorization: `Bearer ${mintDevToken(principal)}` });

describe('a route the app adds to the built server', () => {
  it('reads the principal a session token resolves to, and their roles', async () => {
    const { server } = await boot();
    const answer = await server.request('/who', { headers: as('usr_staff') });
    expect(await answer.json()).toEqual({ principal: 'usr_staff', roles: ['staff'] });
    server.close();
  });

  it('reads nobody as null — anonymity is a principal, not an error', async () => {
    const { server } = await boot();
    const answer = await server.request('/who');
    expect(await answer.json()).toEqual({ principal: null, roles: ['public'] });
    // A browser sends a cookie with requests another site makes it send. So no
    // route reads the one a session is kept in: who is asking is `Authorization`.
    const held = mintDevToken('usr_staff');
    const withCookie = await server.request('/who', { headers: { origin: 'http://localhost', host: 'localhost', cookie: `nisc.token=${held}; __Host-nisc.token=${held}` } });
    expect(await withCookie.json()).toEqual({ principal: null, roles: ['public'] });
    server.close();
  });

  it('is not reached by a token that does not resolve', async () => {
    const { server, reached } = await boot();
    const answer = await quietly(() => Promise.resolve(server.request('/who', { headers: { Authorization: 'Bearer not-a-token' } })));
    expect(answer.status).toBe(401);
    expect(reached.times).toBe(0);
    server.close();
  });

  it('is handed a body of bytes as it was sent, with who sent it', async () => {
    const { server } = await boot();
    const sent = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const answer = await server.request('/files', { method: 'POST', headers: { ...as('usr_staff'), 'content-type': 'image/png' }, body: sent });
    expect(await answer.json()).toEqual({ principal: 'usr_staff', type: 'image/png', bytes: [...sent] });
    server.close();
  });
});
