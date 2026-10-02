// SSR check — the page a request is answered with is the screen the socket
// would have streamed, and the browser's own terminal adopts it as it stands.
//
// The real server, the real document route (src/server/document.ts), the real
// wire and the real React target over a jsdom page whose socket never opens —
// the moment in which the page is up and the wire is not.
//
//   1. nobody asking: the sign-in screen, drawn; a cache may keep it
//   2. a member asking: their own screen, drawn; nothing may keep it; the
//      studio's palette is in the markup before any script runs
//   3. their terminal adopts the page on a NARROW window and on a WIDE one — the
//      window's width is the one thing a server cannot know, and a kit that
//      answered it differently on the two sides threw the page away
//      (ui/components/layout.tsx, `useWide`)
//   4. on a wide window the rail is there after adoption: drawn narrow, made
//      wide in place
//
// Run: pnpm --filter lyra exec tsx src/dev/ssr-check.ts
import { JSDOM } from 'jsdom';
import { mintToken, ok, report, server } from './world';
import { renderPage } from '@lyra/server/document';

const TEMPLATE = '<!doctype html><html lang="en"><head><title>Lyra</title></head><body><div id="root"></div></body></html>';
const MEMBER = 'tom.vogel@example.com';

const open = async (html: string, token: string | null, wide: boolean): Promise<{ complaints: string[]; rail: boolean; sockets: number }> => {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const media = { matches: wide, addEventListener: (): void => undefined, removeEventListener: (): void => undefined };
  Object.defineProperty(dom.window, 'matchMedia', { value: () => media, configurable: true });
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    navigator: dom.window.navigator,
    getComputedStyle: dom.window.getComputedStyle,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  const { act } = await import('react');
  const { createWire, readDocumentSnapshot } = await import('@niscorp/moss/client');
  const { createTerminal } = await import('@niscorp/moss/terminal');
  const { reactTarget } = await import('@niscorp/moss/terminal/react');
  const { buildRegistry } = await import('@lyra/ui/registry');
  const { lyraSlotWrapper } = await import('@lyra/ui/slot-wrapper');

  const root = dom.window.document.getElementById('root');
  if (root === null) throw new Error('ssr-check: the page has no root');
  const complaints: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void complaints.push(args.map(String).join(' ').replace(/\s+/g, ' ').slice(0, 240));
  let sockets = 0;
  const drawn = readDocumentSnapshot(dom.window.document);
  const wire = createWire({
    ...(drawn !== undefined ? { initial: drawn } : {}),
    env: {
      tokens: { load: () => token, save: () => undefined, clear: () => undefined },
      socket: () => {
        sockets += 1;
        const never: Pick<WebSocket, 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'> = { send: () => undefined, close: () => undefined, onopen: null, onmessage: null, onclose: null };
        return never as WebSocket;
      },
      defaultUrl: () => 'ws://localhost/socket',
    },
  });
  await act(async () => {
    createTerminal({ target: reactTarget({ root, registry: buildRegistry(), slotWrapper: lyraSlotWrapper }), wire });
  });
  console.error = realError;
  return { complaints, rail: dom.window.document.querySelector('.ly-drawer--rail') !== null, sockets };
};

// ── 1. nobody asking ──
const anonymous = await renderPage({ server, template: TEMPLATE, path: '/', cookie: null });
ok('nobody asking: the sign-in screen is drawn', anonymous.drawn && anonymous.principal === null && /<div id="root"><[a-z]/.test(anonymous.html));
ok('…a cache may keep it, told apart on the cookie', anonymous.headers['cache-control'] === 'no-cache' && anonymous.headers['vary'] === 'Cookie');
const stranger = await open(anonymous.html, null, true);
ok('…and its terminal adopts it', stranger.complaints.length === 0, stranger.complaints[0] ?? '');

// ── 2. a member asking ──
const token = await mintToken(MEMBER);
if (token === null) throw new Error('ssr-check: no token for the member');
const theirs = await renderPage({ server, template: TEMPLATE, path: '/', cookie: `nisc.token=${encodeURIComponent(token)}` });
ok('a member asking: their own screen is drawn, not the sign-in', theirs.drawn && theirs.principal !== null && theirs.html !== anonymous.html && theirs.html.length > 2000);
ok('…nothing may keep it', theirs.headers['cache-control'] === 'private, no-store');
ok('…and it is the app’s shell: live, kept for them', theirs.live === true && theirs.page === undefined);

// ── 3 & 4. adoption, whatever the window's width ──
const narrow = await open(theirs.html, token, false);
ok('their terminal adopts it on a narrow window', narrow.complaints.length === 0, narrow.complaints[0] ?? '');
ok('…with no rail, as drawn', !narrow.rail);
const wide = await open(theirs.html, token, true);
ok('their terminal adopts it on a WIDE window too', wide.complaints.length === 0, wide.complaints[0] ?? '');
ok('…and the rail is there straight after: drawn narrow, made wide in place', wide.rail);
ok('…over one socket', wide.sockets === 1);

report('the page, drawn on the server');
