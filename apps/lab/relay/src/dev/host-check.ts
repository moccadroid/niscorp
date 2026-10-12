import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { CLOSE_SIGNED_OUT, offerToken, PROTOCOL } from '@niscorp/moss/protocol';
import type { ServerMessage } from '@niscorp/moss/protocol';
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
  shellFrame: () => string;
  granted: () => string | null;
};

const connect = (base: string, token?: string): Promise<Client> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token ?? null));
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

  const alex = await connect(base, alexToken);
  await alex.until(() => alex.frame('sidebar') !== '' && alex.frame('main') !== '', 'initial frames');
  checks.push(['the sidebar tree arrives over the socket', alex.frame('sidebar').includes('nav-deals')]);
  checks.push(["alex's sidebar offers tasks (granted)", alex.frame('sidebar').includes('nav-tasks')]);
  await alex.until(() => alex.frame('main').length > 200, 'home content');
  checks.push([`the main canvas carries the home screen (${alex.frame('main').length} chars of tree)`, alex.frame('main').length > 200]);

  const alex2 = await connect(base, alexToken);
  await alex2.until(() => alex2.frame('main') !== '' && alex2.frame('main') === alex.frame('main'), 'reattach converges');
  checks.push(['a second connection reattaches to the SAME shell (same main tree)', alex2.frame('main') === alex.frame('main')]);

  const aDeal = (await runtime.db.query('SELECT title FROM deals LIMIT 1')).rows[0] as { title: string };
  alex.send({ type: 'event', canvas: 'sidebar', event: { type: 'ui:click', ref: 'nav-deals' } });
  await alex.until(() => alex.frame('main').includes(aDeal.title), 'deals list after nav click');
  checks.push([`nav click → the deals list renders with live data ("${aDeal.title}" present)`, alex.frame('main').includes(aDeal.title)]);

  await alex2.until(
    () => alex2.frame('main').includes(aDeal.title) && alex2.frame('main') === alex.frame('main'),
    'fan-out converges on the second connection',
  );
  checks.push(['the same frame reached the second connection (shared canvas fan-out)', alex2.frame('main') === alex.frame('main')]);

  const jordan = await connect(base, jordanToken);
  await jordan.until(() => jordan.frame('sidebar') !== '', "jordan's frames");
  checks.push(["jordan's sidebar omits tasks (ungranted — a different application)", !jordan.frame('sidebar').includes('nav-tasks')]);

  await alex.until(() => alex.frame('topbar') !== '', "alex's topbar");
  await jordan.until(() => jordan.frame('topbar') !== '', "jordan's topbar");
  checks.push(["alex's topbar carries the New button (the granted full variant)", alex.frame('topbar').includes('New')]);
  checks.push(["jordan's topbar has NO New button (the floor — same action, base layout)", !jordan.frame('topbar').includes('New')]);
  checks.push(["jordan's topbar still searches (the shared piece is in both shapes)", jordan.frame('topbar').includes('Search actions')]);
  checks.push(["the assistant is variant chrome too (alex has it, jordan does not)", !jordan.frame('topbar').includes('assistant') && alex.frame('topbar').includes('assistant')]);

  checks.push(['the empty aside canvas arrives as [] (no phantom rail)', alex.frame('aside') === '[]']);

  const mainBefore = alex.frame('main');
  alex.send({ type: 'event', canvas: 'topbar', event: { type: 'ui:model', ref: 'search', payload: 'zzz-nothing' } });
  await alex.until(() => alex.frame('topbar').includes('zzz-nothing'), 'topbar search echoes');
  checks.push(['the canvas-tagged keystroke reached the topbar search', alex.frame('topbar').includes('zzz-nothing')]);
  checks.push(['…and did NOT leak into the open screen (main tree untouched)', alex.frame('main') === mainBefore]);

  checks.push(['the shell frame arrives over the socket (CanvasSlot markers)', alex.shellFrame().includes('CanvasSlot') && alex.shellFrame().includes('sidebar')]);

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
