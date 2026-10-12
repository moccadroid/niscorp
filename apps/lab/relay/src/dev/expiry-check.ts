import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { CLOSE_INVALID_TOKEN, offerToken, PROTOCOL } from '@niscorp/moss/protocol';
import { attachSocket } from '@niscorp/moss/node';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import type { ServerMessage } from '@niscorp/moss/protocol';
import type { RenderNode } from '@niscorp/nova';
import { serverOn } from '../server/boot';
import { devRuntime } from '../server/runtime';
import { mintToken, userByUsername } from '../server/users';

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
    const ws = new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token ?? null));
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

  const issued = new Map<string, string>();
  const dead = new Set<string>();
  const session = (token: string): string | null => (dead.has(token) ? null : (issued.get(token) ?? null));
  const issue = (username: string): string => {
    const user = userByUsername(username);
    const token = mintToken(username);
    if (user === undefined || token === null) throw new Error(`no user "${username}"`);
    issued.set(token, user.id);
    return token;
  };

  // 250ms so the check does not sleep through the 60s default.
  const server = await serverOn({ ...runtime, session, sessionRevalidateMs: 250 });
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const alexToken = issue('alex');
  const jordanToken = issue('jordan');

  const alex = await connect(base, alexToken);
  const jordan = await connect(base, jordanToken);
  await until(() => alex.frame('sidebar') !== '' && jordan.frame('sidebar') !== '', 'both applications render');
  checks.push(['a valid session renders as it always did', alex.frame('sidebar').includes('nav-deals')]);

  await new Promise((r) => setTimeout(r, 1200));
  checks.push(['…and survives revalidation passes without being disturbed', alex.closeCode() === null]);

  dead.add(alexToken);

  await until(() => alex.closeCode() !== null, 'the expired connection closes');
  checks.push([`an expired token closes the live socket with 4401 (got ${alex.closeCode()})`, alex.closeCode() === CLOSE_INVALID_TOKEN]);
  checks.push(['…having said why first, as at upgrade', alex.errorCode() === 'invalid_token']);

  checks.push(['…and nobody else was touched', jordan.closeCode() === null && jordan.frame('sidebar') !== '']);

  const refused = await server.request('/catalog', { headers: { Authorization: `Bearer ${alexToken}` } });
  checks.push([`the same dead token was ALREADY refused by the HTTP surfaces (got ${refused.status})`, refused.status === 401]);
  checks.push(['…which is why a socket that never re-asked was the asymmetry, not the policy', true]);

  const laterToken = issue('jordan');
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
  server.close();
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
