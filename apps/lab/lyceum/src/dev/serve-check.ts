// SERVE CHECK — the deployed shape, minus Postgres: one process serving moss,
// the one-time sign-in and the built terminal. The same `mountLogin` and
// `mountSite` `serve.ts` composes, over the dev runtime, against a stand-in
// dist/ so the check does not need a vite build.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from '@lyceum/server/boot';
import { hashLinkToken, mountLogin } from '@lyceum/server/login';
import { mountSite } from '@lyceum/server/site';
import { mintSession } from '@niscorp/moss';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { check, connect, finish } from './harness';

const main = async (): Promise<void> => {
  const dist = await mkdtemp(join(tmpdir(), 'lyceum-dist-'));
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><div id="root"></div><!-- the one page -->');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("terminal")');

  const { server, runtime, close } = await boot();
  mountLogin(server, runtime.pool);
  mountSite(server, dist);
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const http = `http://127.0.0.1:${address.port}`;
  const get = async (path: string): Promise<{ status: number; text: string }> => {
    const res = await fetch(`${http}${path}`);
    return { status: res.status, text: await res.text() };
  };

  // ── the terminal: files, and the one page for everything else ──
  check('/ is the one page', (await get('/')).text.includes('the one page'));
  check('a built asset is served as a file', (await get('/assets/app.js')).text.includes('terminal'));
  check('any other path is the one page — there is no client routing', (await get('/?seat=ada')).text.includes('the one page'));
  const catalog = await get('/catalog');
  check('moss still answers its own surfaces (/catalog)', catalog.status === 200 && !catalog.text.includes('the one page'));
  check('an unknown /api path is not answered with the page', !(await get('/api/nothing-here')).text.includes('the one page'));

  // ── a one-time link: minted, redeemed once, into a real session ──
  const mint = async (principal: string, expiresInMs: number): Promise<string> => {
    const token = randomBytes(32).toString('base64url');
    await runtime.db.query('INSERT INTO login_links (token_hash, principal, expires_at) VALUES ($1, $2, $3)', [
      hashLinkToken(token),
      principal,
      new Date(Date.now() + expiresInMs).toISOString(),
    ]);
    return token;
  };

  const token = await mint('speaker', 60_000);
  const first = await get(`/login?token=${token}`);
  const session = /"(st_[^"]+)"/.exec(first.text)?.[1];
  check('the link signs the device in, into the speaker\'s own seat', session !== undefined && first.text.includes('nisc.token.speaker') && first.text.includes('/?seat=speaker'));
  check('the link is used up on the first click', (await get(`/login?token=${token}`)).text.includes('used or has expired'));
  const stored = await runtime.db.query<{ n: number }>('SELECT count(*)::int AS n FROM login_links');
  check('nothing of it is left in the database', stored.rows[0]?.n === 0);

  const expired = await mint('stage', -1_000);
  check('an expired link signs nobody in', (await get(`/login?token=${expired}`)).text.includes('used or has expired'));
  check('a made-up link signs nobody in', (await get('/login?token=nonsense')).text.includes('used or has expired'));

  const speaker = await connect(`ws://127.0.0.1:${address.port}`, session);
  const hello = await speaker.hello();
  check('the session it minted is the speaker, holding the controller', hello.principal === 'speaker' && hello.catalog.actions.includes('speaker.console'));

  // ── the door: a person writes their own row, and only their own ──
  const replay = async (token: string, fingerprint: string, context: Record<string, unknown>): Promise<number> =>
    (await fetch(`${http}/api/vex`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ fingerprint, context }) })).status;
  const newcomer = await mintSession(runtime.pool, 'm_newcomer', 60_000);
  // A request that tries to name the row after somebody else: the id is not
  // the request's to set.
  const joined = await replay(newcomer, memberJoin.fingerprint, { name: 'Somebody', member_id: 'speaker', memberId: 'speaker' });
  const rows = await runtime.db.query<{ member_id: string }>("SELECT member_id FROM members WHERE name = 'Somebody'");
  check('stepping in writes a row stamped with the person\'s own id, whatever the request says', joined === 200 && rows.rows.length === 1 && rows.rows[0]?.member_id === 'm_newcomer');
  server.invalidateIdentity('m_newcomer');
  check('a member cannot step in twice', (await replay(newcomer, memberJoin.fingerprint, { name: 'Again' })) !== 200);

  speaker.close();
  httpServer.close();
  await close();
  await rm(dist, { recursive: true, force: true });
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
