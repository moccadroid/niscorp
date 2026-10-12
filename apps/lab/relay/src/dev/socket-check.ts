import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { CLOSE_INVALID_TOKEN, offerToken, PROTOCOL } from '@niscorp/moss/protocol';
import type { ServerMessage } from '@niscorp/moss/protocol';
import { boot } from '../server/boot';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];

type Frame = ServerMessage;

const connect = (base: string, token?: string): Promise<{
  next: () => Promise<Frame>;
  send: (body: unknown) => void;
  closed: () => Promise<number>;
  close: () => void;
}> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token ?? null));
    const frames: Frame[] = [];
    const waiters: ((f: Frame) => void)[] = [];
    let closeCode: number | undefined;
    const closeWaiters: ((code: number) => void)[] = [];
    ws.addEventListener('message', (e) => {
      const frame = JSON.parse(String(e.data)) as Frame;
      if (frame.type === 'render' || frame.type === 'frame' || frame.type === 'session') return; // this check reads control frames only
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

  const bad = await connect(base, 'garbage');
  const badFrame = await bad.next();
  const badClose = await bad.closed();
  checks.push([`a garbage token is refused (got ${badFrame.type === 'error' ? badFrame.code : badFrame.type}, close ${badClose})`, badFrame.type === 'error' && badFrame.code === 'invalid_token' && badClose === CLOSE_INVALID_TOKEN]);

  alex.send('not json{');
  const malformed = await alex.next();
  checks.push([`a malformed frame is an error (got ${malformed.type === 'error' ? malformed.code : malformed.type})`, malformed.type === 'error' && malformed.code === 'invalid_message']);

  alex.send({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'nav-deals' } });
  alex.send('also not json');
  const afterEvent = await alex.next();
  checks.push([`a valid event produces no error; the next control frame is the NEXT probe's (got ${afterEvent.type === 'error' ? afterEvent.code : afterEvent.type})`, afterEvent.type === 'error' && afterEvent.code === 'invalid_message']);

  alex.close();
  const again = await connect(base, alexToken);
  const againHello = await again.next();
  checks.push(['reconnect gets hello again, same version token', againHello.type === 'hello' && againHello.catalog.hash === alexCatalog.hash]);

  again.close();
  anon.close();
  httpServer.close();
  // ws and PGlite teardown racing process.exit trips a libuv assertion on
  // Windows.
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
