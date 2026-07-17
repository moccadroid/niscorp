// Socket check — the transport + protocol through a REAL websocket:
// node's native WebSocket client against the served socket. Token auth at
// upgrade (anonymous is a principal, garbage is a 4401 close), the catalog
// channel on every (re)connect with the SAME version token the HTTP
// surface serves, and envelope enforcement. Render frames stream too now
// (the shell host stands behind the socket) — this check reads CONTROL
// frames only; host-check owns the canvas streams.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { CLOSE_INVALID_TOKEN } from '@niscorp/moss';
import type { ServerMessage } from '@niscorp/moss';
import { boot } from '../server/boot';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];

type Frame = ServerMessage;

// A tiny client harness over node's built-in WebSocket: collects frames,
// resolves on demand, notices the close code.
const connect = (base: string, token?: string): Promise<{
  next: () => Promise<Frame>;
  send: (body: unknown) => void;
  closed: () => Promise<number>;
  close: () => void;
}> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/socket${token !== undefined ? `?token=${encodeURIComponent(token)}` : ''}`);
    const frames: Frame[] = [];
    const waiters: ((f: Frame) => void)[] = [];
    let closeCode: number | undefined;
    const closeWaiters: ((code: number) => void)[] = [];
    ws.addEventListener('message', (e) => {
      const frame = JSON.parse(String(e.data)) as Frame;
      if (frame.type === 'render' || frame.type === 'frame' || frame.type === 'session') return; // canvas/session streams are host-check's subject
      const waiter = waiters.shift();
      if (waiter !== undefined) waiter(frame);
      else frames.push(frame);
    });
    ws.addEventListener('close', (e) => {
      closeCode = e.code;
      for (const w of closeWaiters.splice(0)) w(e.code);
    });
    ws.addEventListener('error', () => reject(new Error('socket error')));
    ws.addEventListener('open', () =>
      resolve({
        next: () => {
          const buffered = frames.shift();
          if (buffered !== undefined) return Promise.resolve(buffered);
          return new Promise<Frame>((r, x) => {
            waiters.push(r);
            setTimeout(() => x(new Error('timed out waiting for a frame')), 4000);
          });
        },
        send: (body) => ws.send(typeof body === 'string' ? body : JSON.stringify(body)),
        closed: () =>
          closeCode !== undefined ? Promise.resolve(closeCode) : new Promise<number>((r) => closeWaiters.push(r)),
        close: () => ws.close(),
      }),
    );
  });

const main = async (): Promise<void> => {
  const { server, runtime } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  // ── the catalog channel, per principal, token-authenticated ──
  const alexToken = mintToken('alex');
  if (alexToken === null) throw new Error('no alex');
  const alex = await connect(base, alexToken);
  const alexHello = await alex.next();
  checks.push([`alex's hello carries their principal (got ${String((alexHello as { principal?: unknown }).principal)})`, alexHello.type === 'hello' && alexHello.principal === 'usr_001']);
  const alexCatalog = alexHello.type === 'hello' ? alexHello.catalog : { actions: [], hash: '' };
  checks.push(['the socket catalog is the resolved application (deal form present)', alexCatalog.actions.includes('crm.deal.form')]);

  const http = await server.request('/catalog', { headers: { Authorization: `Bearer ${alexToken}` } });
  const httpCatalog = (await http.json()) as { hash: string };
  checks.push([`one version token across both planes (ws ${alexCatalog.hash} = http ${httpCatalog.hash})`, alexCatalog.hash === httpCatalog.hash]);

  const anon = await connect(base);
  const anonHello = await anon.next();
  checks.push(['anonymous is a principal: hello with the lock screen alone', anonHello.type === 'hello' && anonHello.principal === null && anonHello.type === 'hello' && anonHello.catalog.actions.length === 1 && anonHello.catalog.actions[0] === 'auth.login']);

  // ── garbage token → error + application close 4401 ──
  const bad = await connect(base, 'garbage');
  const badFrame = await bad.next();
  const badClose = await bad.closed();
  checks.push([`a garbage token is refused (got ${badFrame.type === 'error' ? badFrame.code : badFrame.type}, close ${badClose})`, badFrame.type === 'error' && badFrame.code === 'invalid_token' && badClose === CLOSE_INVALID_TOKEN]);

  // ── the envelope is enforced; events are answered honestly ──
  alex.send('not json{');
  const malformed = await alex.next();
  checks.push([`a malformed frame is an error (got ${malformed.type === 'error' ? malformed.code : malformed.type})`, malformed.type === 'error' && malformed.code === 'invalid_message']);

  // A valid event envelope is ACCEPTED into the session's shell — no error
  // frame comes back (the render consequences are host-check's subject).
  alex.send({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'nav-deals' } });
  alex.send('also not json');
  const afterEvent = await alex.next();
  checks.push([`a valid event produces no error; the next control frame is the NEXT probe's (got ${afterEvent.type === 'error' ? afterEvent.code : afterEvent.type})`, afterEvent.type === 'error' && afterEvent.code === 'invalid_message']);

  // ── reconnect re-sends current state — no replay machinery ──
  alex.close();
  const again = await connect(base, alexToken);
  const againHello = await again.next();
  checks.push(['reconnect gets hello again, same version token', againHello.type === 'hello' && againHello.catalog.hash === alexCatalog.hash]);

  again.close();
  anon.close();
  httpServer.close();
  // Wind the handles down BEFORE exiting — ws + PGlite teardown racing
  // process.exit trips a libuv assertion on Windows.
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
  console.log('\nOK — the socket authenticates, serves the catalog channel, and speaks the envelope honestly.');
  process.exit(0);
};

void main();
