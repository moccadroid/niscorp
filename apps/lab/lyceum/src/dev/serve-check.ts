// SERVE CHECK — the deployed shape, minus Postgres: one process serving moss,
// the sign-ins (a one-time link, the speaker's mailed link, the stage) and the
// built terminal. The same `mountLogin` and
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
import type { Mail } from '@lyceum/server/mail';
import { mintSession } from '@niscorp/moss';
import { memberJoin } from '@lyceum/app/vex/member.entries';
import { questionJudge } from '@lyceum/app/vex/question.entries';
import { deckGo } from '@lyceum/app/vex/deck.entries';
import { DECK_ID } from '@lyceum/db/seed';
import { check, connect, finish, waitUntil } from './harness';

const main = async (): Promise<void> => {
  const dist = await mkdtemp(join(tmpdir(), 'lyceum-dist-'));
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><div id="root"></div><!-- the one page -->');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("terminal")');

  // The mail that would have gone out, caught instead of sent.
  const outbox: Mail[] = [];
  const { server, runtime, close } = await boot(undefined, {
    publicUrl: 'https://lyceum.test',
    speakerEmail: 'Speaker@Lyceum.test',
    send: async (mail) => void outbox.push(mail),
  });
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
  check('the session it minted is the speaker, with the controller', hello.principal === 'speaker' && hello.catalog.actions.includes('speaker.console'));

  // ── the speaker asks by email, at a desk only /speaker opens ──
  const deskPage = await get('/speaker');
  const deskSession = /"(st_[^"]+)"/.exec(deskPage.text)?.[1];
  check('/speaker hands the device a session of its own, in the desk\'s seat', deskSession !== undefined && deskPage.text.includes('nisc.token.lectern') && deskPage.text.includes('/?seat=lectern'));
  const otherDesk = /"(st_[^"]+)"/.exec((await get('/speaker')).text)?.[1];
  const desk = await connect(`ws://127.0.0.1:${address.port}`, deskSession);
  const deskHello = await desk.hello();
  const otherHello = await (await connect(`ws://127.0.0.1:${address.port}`, otherDesk)).hello();
  check('…a principal of its own: two devices at /speaker are two desks', deskHello.principal !== null && otherHello.principal !== null && deskHello.principal !== otherHello.principal);
  check(`…which has the sign-in desk, nothing else (${deskHello.catalog.actions.join(', ')})`, deskHello.catalog.actions.join() === 'lectern.signin');
  check('the desk renders on the main canvas', await desk.shows('main', 'Send me a link'));
  const door = await connect(`ws://127.0.0.1:${address.port}`);
  const strangerHolds = (await door.hello()).catalog.actions;
  check(`the door does not offer it: a stranger holds no desk (${strangerHolds.join(', ')})`, strangerHolds.includes('door.join') && !strangerHolds.includes('lectern.signin'));
  door.close();

  const ask = async (email: string): Promise<void> => {
    desk.type('main', 'email', email);
    await new Promise((resolve) => setTimeout(resolve, 100));
    desk.click('main', 'send');
    await desk.shows('main', 'on its way');
  };
  await ask('someone@else.test');
  check('another address is told the same thing and mailed nothing', desk.showsNow('main', 'on its way') && outbox.length === 0);
  await ask('  speaker@lyceum.test ');
  await waitUntil(() => outbox.length > 0);
  const mailed = outbox[0];
  const mailedToken = /\/login\?token=([\w-]+)/.exec(mailed?.text ?? '')?.[1];
  check('the speaker\'s address, in any case, is mailed one link to the public address', desk.showsNow('main', 'on its way') && outbox.length === 1 && mailed?.to === 'speaker@lyceum.test' && (mailed?.text.includes('https://lyceum.test/login?token=') ?? false));
  desk.close();
  const redeemedMail = await get(`/login?token=${mailedToken ?? ''}`);
  check('the mailed link signs the device in as the speaker', redeemedMail.text.includes('nisc.token.speaker') && redeemedMail.text.includes('/?seat=speaker'));
  check('the mailed link works once', (await get(`/login?token=${mailedToken ?? ''}`)).text.includes('used or has expired'));

  // ── the stage: no secret, and nothing it could do with one ──
  const stagePage = await get('/stage');
  const stageSession = /"(st_[^"]+)"/.exec(stagePage.text)?.[1];
  check('/stage signs the device in as the stage, into its own seat', stageSession !== undefined && stagePage.text.includes('nisc.token.stage') && stagePage.text.includes('/?seat=stage'));
  const stage = await connect(`ws://127.0.0.1:${address.port}`, stageSession);
  const stageHello = await stage.hello();
  check('the stage session is the stage, without the controller', stageHello.principal === 'stage' && !stageHello.catalog.actions.some((id) => id.startsWith('speaker.')));
  stage.close();

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

  // The stage is open to anyone because it can change nothing.
  // Control first: the same write as the speaker lands, so the refusal
  // below is the stage's policy, not a malformed request.
  check('the speaker can move the deck', (await replay(session ?? '', deckGo.fingerprint, { deck: DECK_ID, position: 2 })) === 200);
  const stageWrites = [
    await replay(stageSession ?? '', deckGo.fingerprint, { deck: DECK_ID, position: 1 }),
    await replay(stageSession ?? '', questionJudge.fingerprint, { questionId: 'anything', text: 'Forged', appropriate: true, score: 1 }),
  ];
  check('a stage session cannot move the deck or judge anybody\'s question', stageWrites.every((status) => status !== 200));

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
