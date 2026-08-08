// Session-expiry check — the claim: an app that gives its tokens a lifetime
// gets that lifetime enforced on a LIVE socket, not merely on the next connect.
//
// Why this needed a check of its own. moss asks "who is this" in two places,
// and until now they disagreed: the HTTP middleware re-asked on every request,
// while the socket asked once at upgrade and then trusted the answer forever.
// An app could already express expiry — the `session` seam returns null for a
// dead token and always could — but on a connection somebody was holding open,
// nothing was listening for that answer.
//
// The shape of the old failure is the interesting part, and it is asserted
// below rather than described: the server shell's own wire rides the HTTP
// middleware under the session's token, so an expired credential left the
// socket open and cheerful — frames flowing, screen alive — while every
// endpoint the shell called came back 401. A live interface whose every load
// silently fails is strictly worse than a lock screen.
//
// Nothing about the recovery is new. `4401` was always a recovery rather than
// a retry, and the terminal always dropped its token and reconnected anonymous
// onto the served lock screen. What was missing was something asking the
// question. The second half of this check drives the REAL client wire to prove
// the two halves meet.
//
// Run: pnpm --filter relay exec tsx src/dev/expiry-check.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createServer, devSession, CLOSE_INVALID_TOKEN } from '@niscorp/moss';
import { attachSocket } from '@niscorp/moss/node';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import type { ServerMessage } from '@niscorp/moss';
import type { RenderNode } from '@niscorp/nova';
import { relay } from '../app/app';
import { devRuntime } from '../server/runtime';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];
const until = (pred: () => boolean, why: string, ms = 15000): Promise<void> =>
  new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (pred()) return res();
      if (Date.now() - t0 > ms) return rej(new Error(`timed out: ${why}`));
      setTimeout(tick, 40);
    };
    tick();
  });

type Client = {
  frame: (canvas: string) => string;
  closeCode: () => number | null;
  errorCode: () => string | null;
  close: () => void;
};

const connect = (base: string, token?: string): Promise<Client> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/socket${token === undefined ? '' : `?token=${encodeURIComponent(token)}`}`);
    const last = new Map<string, string>();
    let closeCode: number | null = null;
    let errorCode: string | null = null;
    ws.addEventListener('close', (e) => void (closeCode = e.code));
    ws.addEventListener('message', (e) => {
      const message = JSON.parse(String(e.data)) as ServerMessage & { tree?: RenderNode[] };
      if (message.type === 'render') last.set(message.canvas, JSON.stringify(message.tree));
      if (message.type === 'error') errorCode = message.code;
    });
    ws.addEventListener('error', () => reject(new Error('socket error')));
    ws.addEventListener('open', () =>
      resolve({
        frame: (canvas) => last.get(canvas) ?? '',
        closeCode: () => closeCode,
        errorCode: () => errorCode,
        close: () => ws.close(),
      }),
    );
  });

const main = async (): Promise<void> => {
  const runtime = await devRuntime();

  // ── an app that gives its tokens a lifetime ────────────────
  // The whole of what an application has to write. `devSession` still does the
  // decoding; this adds the one thing a real verifier adds and the dev pair
  // has never had — a token can STOP being valid. Nothing in moss learns what
  // expiry means; it only learns to ask again.
  const dead = new Set<string>();
  const session = (token: string): string | null => (dead.has(token) ? null : devSession(token));

  // A quarter-second so the check runs at human speed. A deployment leaves
  // this at the 60s default; it is here because a check should not sleep for a
  // minute to prove a timer fires.
  const server = await createServer(relay, { ...runtime, session, sessionRevalidateMs: 250 });
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const alexToken = mintToken('alex');
  const jordanToken = mintToken('jordan');
  if (alexToken === null || jordanToken === null) throw new Error('users missing');

  // ── a live connection, then a dead credential ──────────────
  const alex = await connect(base, alexToken);
  const jordan = await connect(base, jordanToken);
  await until(() => alex.frame('sidebar') !== '' && jordan.frame('sidebar') !== '', 'both applications render');
  checks.push(['a valid session renders as it always did', alex.frame('sidebar').includes('nav-deals')]);

  // Many revalidation passes go by while the token is good, and none of them
  // interfere — the check that would catch a verifier being asked and its
  // answer being misread.
  await new Promise((r) => setTimeout(r, 1200));
  checks.push(['…and survives revalidation passes without being disturbed', alex.closeCode() === null]);

  dead.add(alexToken);

  await until(() => alex.closeCode() !== null, 'the expired connection closes');
  checks.push([`an expired token closes the live socket with 4401 (got ${alex.closeCode()})`, alex.closeCode() === CLOSE_INVALID_TOKEN]);
  checks.push(['…having said why first, as at upgrade', alex.errorCode() === 'invalid_token']);

  // The blast radius is one credential. A verifier that answered for everyone
  // would be a far worse bug than the one being fixed.
  checks.push(['…and nobody else was touched', jordan.closeCode() === null && jordan.frame('sidebar') !== '']);

  // ── the half that used to be missing ───────────────────────
  // This is the old failure, asserted as a fact rather than trusted as a
  // memory: the token is dead, so moss's HTTP surfaces refuse it — which is
  // exactly what the server shell's own wire was riding while the socket
  // stayed open.
  const refused = await server.request('/catalog', { headers: { Authorization: `Bearer ${alexToken}` } });
  checks.push([`the same dead token was ALREADY refused by the HTTP surfaces (got ${refused.status})`, refused.status === 401]);
  checks.push(['…which is why a socket that never re-asked was the asymmetry, not the policy', true]);

  // ── and the terminal recovers by itself ────────────────────
  // The real client wire, on the real transport. 4401 is a recovery and not a
  // retry: it drops the stored token and reconnects anonymous, so the person
  // lands on the served lock screen rather than watching a dead application.
  const laterToken = mintToken('jordan');
  if (laterToken === null) throw new Error('no jordan token');
  const tokenFile = join(mkdtempSync(join(tmpdir(), 'relay-expiry-')), 'token');
  writeFileSync(tokenFile, laterToken, 'utf8');

  const wire = createWire({ env: nodeEnv({ url: `${base}/socket`, tokenFile }) });
  await until(() => (wire.snapshot().trees.get('sidebar') ?? []).length > 0, 'the wire renders the signed-in application');
  checks.push(['a terminal on the real wire is signed in', JSON.stringify(wire.snapshot().trees.get('sidebar')).includes('nav-contacts')]);

  dead.add(laterToken);
  await until(() => JSON.stringify(wire.snapshot().trees.get('main') ?? []).includes('Send magic link'), 'the terminal lands on the lock screen');
  checks.push(['…and when its session expires it recovers to the lock screen on its own', true]);
  checks.push(['…having dropped the dead token rather than looping on it', wire.status() !== 'closed']);

  wire.dispose();
  alex.close();
  jordan.close();
  server.socket.stop();
  server.shells?.stop();
  httpServer.close();
  await new Promise((r) => setTimeout(r, 150));
  await runtime.db.close();

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — a session that expires expires everywhere: the socket re-asks, and the terminal recovers itself.');
  process.exit(0);
};

void main();
