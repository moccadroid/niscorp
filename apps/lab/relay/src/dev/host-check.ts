// Shell-host check — SERVER.md 3b.2 through a REAL websocket: the shell
// runs INSIDE moss, per principal, durable; the client is nothing but a
// socket. Render frames flow on connect and on every change; events flow
// up and drive the same nova machinery every headless check drives; two
// connections of one principal are the same shell fanned out (shared
// canvases). The server shell's endpoint calls ride moss's own HTTP
// surfaces under the session's token — same wire, same enforcement.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { CLOSE_SIGNED_OUT } from '@niscorp/moss';
import type { ServerMessage } from '@niscorp/moss';
import type { RenderNode } from '@niscorp/nova';
import { boot } from '../server/boot';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];

type Client = {
  frame: (canvas: string) => string;
  send: (body: unknown) => void;
  until: (predicate: () => boolean, why: string) => Promise<void>;
  close: () => void;
  closeCode: () => number | null;
  // the shell frame (the canvas arrangement) and a session grant, if any
  shellFrame: () => string;
  granted: () => string | null;
};

// A frame-accumulating client: keeps the LAST render frame per canvas
// (frames stream as data loads; the latest is the current truth).
const connect = (base: string, token?: string): Promise<Client> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/socket${token !== undefined ? `?token=${encodeURIComponent(token)}` : ''}`);
    const last = new Map<string, string>();
    let closeCode: number | null = null;
    let shellFrame = '';
    let granted: string | null = null;
    ws.addEventListener('close', (e) => {
      closeCode = e.code;
    });
    ws.addEventListener('message', (e) => {
      const message = JSON.parse(String(e.data)) as ServerMessage & { tree?: RenderNode[] };
      if (message.type === 'render') last.set(message.canvas, JSON.stringify(message.tree));
      if (message.type === 'frame') shellFrame = JSON.stringify(message.tree);
      if (message.type === 'session' && typeof (message as { token?: unknown }).token === 'string') granted = (message as { token: string }).token;
    });
    ws.addEventListener('error', () => reject(new Error('socket error')));
    ws.addEventListener('open', () =>
      resolve({
        frame: (canvas) => last.get(canvas) ?? '',
        send: (body) => ws.send(JSON.stringify(body)),
        until: (predicate, why) =>
          new Promise<void>((r, x) => {
            const started = Date.now();
            const tick = (): void => {
              if (predicate()) return r();
              if (Date.now() - started > 20000) return x(new Error(`timed out: ${why}`));
              setTimeout(tick, 40);
            };
            tick();
          }),
        close: () => ws.close(),
        closeCode: () => closeCode,
        shellFrame: () => shellFrame,
        granted: () => granted,
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
  const jordanToken = mintToken('jordan');
  if (alexToken === null || jordanToken === null) throw new Error('users missing');

  // ── connect: the shell renders server-side, frames arrive ──
  const alex = await connect(base, alexToken);
  await alex.until(() => alex.frame('sidebar') !== '' && alex.frame('main') !== '', 'initial frames');
  checks.push(['the sidebar tree arrives over the socket', alex.frame('sidebar').includes('nav-deals')]);
  checks.push(["alex's sidebar offers tasks (granted)", alex.frame('sidebar').includes('nav-tasks')]);
  await alex.until(() => alex.frame('main').length > 200, 'home content');
  checks.push([`the main canvas carries the home screen (${alex.frame('main').length} chars of tree)`, alex.frame('main').length > 200]);

  // ── a second connection of the SAME principal is the same shell ──
  // (frames may still be streaming; the two connections converge on the
  // same current tree — that convergence IS the reattach semantics)
  const alex2 = await connect(base, alexToken);
  await alex2.until(() => alex2.frame('main') !== '' && alex2.frame('main') === alex.frame('main'), 'reattach converges');
  checks.push(['a second connection reattaches to the SAME shell (same main tree)', alex2.frame('main') === alex.frame('main')]);

  // ── an event drives the server shell; data loads over moss's own wire ──
  const aDeal = (await runtime.db.query('SELECT title FROM deals LIMIT 1')).rows[0] as { title: string };
  alex.send({ type: 'event', canvas: 'sidebar', event: { type: 'ui:click', ref: 'nav-deals' } });
  await alex.until(() => alex.frame('main').includes(aDeal.title), 'deals list after nav click');
  checks.push([`nav click → the deals list renders with live data ("${aDeal.title}" present)`, alex.frame('main').includes(aDeal.title)]);

  // ── the change fanned out to BOTH connections (convergence, not an
  // instant snapshot — trees settle over a couple of frames) ──
  await alex2.until(
    () => alex2.frame('main').includes(aDeal.title) && alex2.frame('main') === alex.frame('main'),
    'fan-out converges on the second connection',
  );
  checks.push(['the same frame reached the second connection (shared canvas fan-out)', alex2.frame('main') === alex.frame('main')]);

  // ── a different principal is a different shell (ring 1, server-side) ──
  const jordan = await connect(base, jordanToken);
  await jordan.until(() => jordan.frame('sidebar') !== '', "jordan's frames");
  checks.push(["jordan's sidebar omits tasks (ungranted — a different application)", !jordan.frame('sidebar').includes('nav-tasks')]);

  // ── ring 2: SAME action id, a different SERVED layout. The base is the
  // floor (no New, no assistant); alex (sales) holds chrome.topbar.full so
  // the write-path chrome exists in his tree; jordan (viewer) is served the
  // floor. Nothing on the wire says why: the terminal renders what it is
  // served ──
  await alex.until(() => alex.frame('topbar') !== '', "alex's topbar");
  await jordan.until(() => jordan.frame('topbar') !== '', "jordan's topbar");
  checks.push(["alex's topbar carries the New button (the granted full variant)", alex.frame('topbar').includes('New')]);
  checks.push(["jordan's topbar has NO New button (the floor — same action, base layout)", !jordan.frame('topbar').includes('New')]);
  checks.push(["jordan's topbar still searches (the shared piece is in both shapes)", jordan.frame('topbar').includes('Search actions')]);
  checks.push(["the assistant is variant chrome too (alex has it, jordan does not)", !jordan.frame('topbar').includes('assistant') && alex.frame('topbar').includes('assistant')]);

  // ── no visible content = an empty tree: the collapsed aside rail is []
  // over the wire, so the terminal collapses chrome on length alone ──
  checks.push(['the empty aside canvas arrives as [] (no phantom rail)', alex.frame('aside') === '[]']);

  // ── transport → shell addressing: a keystroke tagged with its canvas
  // is stamped with that canvas's ACTIVE instance server-side — no client
  // stamping anywhere — so the topbar search cannot leak into the open
  // screen's search ──
  const mainBefore = alex.frame('main');
  alex.send({ type: 'event', canvas: 'topbar', event: { type: 'ui:model', ref: 'search', payload: 'zzz-nothing' } });
  await alex.until(() => alex.frame('topbar').includes('zzz-nothing'), 'topbar search echoes');
  checks.push(['the canvas-tagged keystroke reached the topbar search', alex.frame('topbar').includes('zzz-nothing')]);
  checks.push(['…and did NOT leak into the open screen (main tree untouched)', alex.frame('main') === mainBefore]);

  // ── the frame is SERVED: a layout of CanvasSlot markers the terminal
  // resolves — the browser authors no arrangement of its own ──
  checks.push(['the shell frame arrives over the socket (CanvasSlot markers)', alex.shellFrame().includes('CanvasSlot') && alex.shellFrame().includes('sidebar')]);

  // ── the login loop: an ANONYMOUS terminal is served the lock screen (the
  // charter's `public` grant — ring 1 picks it as main's initial), signs in
  // THROUGH it, and the session grant comes down the socket ──
  const anon = await connect(base);
  await anon.until(() => anon.frame('main').includes('username'), 'anonymous lock screen');
  checks.push(['anonymous is served the lock screen', anon.frame('main').includes('Send magic link')]);
  checks.push(['…and no chrome (sidebar tree empty)', anon.frame('sidebar') === '[]' || anon.frame('sidebar') === '']);
  anon.send({ type: 'event', canvas: 'main', event: { type: 'ui:model', ref: 'username', payload: 'jordan' } });
  await anon.until(() => anon.frame('main').includes('jordan'), 'username echoed');
  anon.send({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'send' } });
  await anon.until(() => anon.frame('main').includes('open-link'), 'magic link sent');
  anon.send({ type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'open-link' } });
  await anon.until(() => anon.granted() !== null, 'session granted');
  checks.push(['redeeming the link delivers a session grant on the socket', anon.granted() !== null]);
  const jordanViaLogin = await connect(base, anon.granted() ?? undefined);
  await jordanViaLogin.until(() => jordanViaLogin.frame('sidebar').includes('nav-contacts'), 'authenticated application');
  checks.push(["reconnecting with the granted token serves jordan's application", jordanViaLogin.frame('sidebar').includes('nav-contacts')]);
  jordanViaLogin.close();
  anon.close();

  // ── sign-out is session lifecycle: the served sidebar button emits on the
  // reserved channel, moss closes every terminal of the principal with
  // SIGNED_OUT and evicts the durable shell — the next connect is fresh ──
  jordan.send({ type: 'event', canvas: 'sidebar', event: { type: 'ui:click', ref: 'sign-out' } });
  await jordan.until(() => jordan.closeCode() !== null, 'signed-out close');
  checks.push([`sign-out closes the connection with SIGNED_OUT (got ${jordan.closeCode()})`, jordan.closeCode() === CLOSE_SIGNED_OUT]);
  const jordan2 = await connect(base, jordanToken);
  await jordan2.until(() => jordan2.frame('sidebar') !== '', 'fresh shell after sign-out');
  checks.push(['a later connect builds a fresh session (sign-in works again)', jordan2.frame('sidebar').includes('nav-contacts')]);
  jordan2.close();

  alex.close();
  alex2.close();
  jordan.close();
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
  console.log('\nOK — the shell runs on the server: frames down, events up, one shell fanned out per principal.');
  process.exit(0);
};

void main();
