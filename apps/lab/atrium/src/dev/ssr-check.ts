// SSR CHECK — the page a request is answered with is the screen the socket
// would have streamed, and the browser's own terminal adopts it as it stands.
//
// Driven the way the app is: the real server, the real document route
// (src/server/document.ts), the real wire and the real React target over a
// jsdom page. No browser, no mocks of ours — only a socket that never opens,
// which is exactly the moment this is about: the page is up and the wire is not.
//
//   1. nobody asking: the lock screen, drawn; kept by caches, told apart on the cookie
//   2. that page's terminal: starts from the page, adopts its elements, and the
//      socket's first frames are the page's own trees (same ids)
//   3. somebody asking: their screen, drawn; never kept; the palette in the markup
//   4. their terminal adopts it too
//   5. a press before the socket is open is dropped, not thrown and not queued
//   6. a dead cookie is the lock screen, and the cookie is taken back
//   7. nothing in a tree can break out of the element the snapshot rides in
import { embedSnapshot } from '@niscorp/moss';
import type { RenderNode } from '@niscorp/nova';
import { mintToken } from '@atrium/server/users';
import { renderPage } from '@atrium/server/document';
import { TEMPLATE, openPage, snapshotIn } from './drawn-page';
import { check, integrations, report, server } from './world';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── 1. nobody asking ──
const anonymous = await renderPage({ server, template: TEMPLATE, path: '/', cookie: null });
const anonymousSnapshot = snapshotIn(anonymous.html);
check('nobody asking: the page is drawn (the lock screen is in the markup)', /<div id="root"><[a-z]/.test(anonymous.html) && !anonymous.html.includes('<div id="root"></div>'));
check('…it says it was drawn for nobody, and under an id seed', anonymousSnapshot.principal === false && typeof anonymousSnapshot.seed === 'string');
check('…a cache may keep it, and must tell it apart on the cookie', anonymous.headers['cache-control'] === 'no-cache' && anonymous.headers['vary'] === 'Cookie');

// ── 2. that page's terminal ──
const stranger = await openPage(anonymous.html, null);
check(`its terminal adopts the page as it stands (${stranger.complaints.length} complaints)`, stranger.complaints.length === 0 && stranger.unchanged);
check('…and names the page’s seed on the socket', anonymousSnapshot.seed !== undefined && (stranger.sockets[0] ?? '').includes(`seed=${anonymousSnapshot.seed}`));
{
  // The socket, for real: what the server sends a connection that names that seed.
  const frames: string[] = [];
  let closed: (() => void) | undefined;
  await server.socket(`/socket?protocol=1&seed=${anonymousSnapshot.seed ?? ''}`, { send: (text) => void frames.push(text), close: () => undefined, onMessage: () => undefined, onClose: (fn) => void (closed = fn) });
  await sleep(150);
  const renders = frames.map((text) => JSON.parse(text) as { type: string; canvas?: string; tree?: RenderNode[] }).filter((message) => message.type === 'render');
  const same = renders.length > 0 && renders.every((message) => JSON.stringify(message.tree) === JSON.stringify(anonymousSnapshot.trees[message.canvas ?? '']));
  check(`the socket’s first frames are the page’s own trees, ids included (${renders.length} canvases)`, same);
  closed?.();
}

// ── 3. somebody asking ──
const token = mintToken('amara');
if (token === null) throw new Error('ssr-check: no token for amara');
const hers = await renderPage({ server, template: TEMPLATE, path: '/', cookie: `theme=dark; nisc.token=${encodeURIComponent(token)}` });
const herSnapshot = snapshotIn(hers.html);
// Her concierge, not the picker: the lock screen names everybody, so a name proves nothing.
check('somebody asking: their screen is drawn (her concierge is in the markup, and was not in nobody’s)', hers.html.includes('A word from the desk') && !anonymous.html.includes('A word from the desk'));
check('…it says it was drawn for somebody, with no seed (her shell is the one the socket attaches to)', herSnapshot.principal === true && herSnapshot.seed === undefined);
check('…nothing may keep it', hers.headers['cache-control'] === 'private, no-store');
check('…the property’s palette is in the markup, before any script', /<html[^>]* data-accent="[a-z0-9-]+"/.test(hers.html));

// ── 4. her terminal ──
const guest = await openPage(hers.html, token);
check(`her terminal adopts it too (${guest.complaints.length} complaints)`, guest.complaints.length === 0 && guest.unchanged);

// ── 5. a press with no socket ──
let threw = false;
try {
  guest.press();
} catch {
  threw = true;
}
check('a press before the socket is open is dropped — nothing thrown, nothing sent', !threw && guest.sent.length === 0);

// ── a page drawn for somebody else is not started from ──
const mismatched = await openPage(hers.html, null);
check('a terminal holding no token does not start from somebody’s page (it is replaced, not adopted)', !mismatched.unchanged);

// ── 6. a dead cookie ──
const dead = await renderPage({ server, template: TEMPLATE, path: '/', cookie: 'nisc.token=not-a-token' });
check('a dead cookie is the lock screen', snapshotIn(dead.html).principal === false && snapshotIn(dead.html).seed !== undefined && !dead.html.includes('A word from the desk'));
check('…and the cookie is taken back', /Max-Age=0/.test(dead.headers['set-cookie'] ?? ''));

// ── 7. the snapshot cannot break out of its element ──
const hostile = embedSnapshot({ frame: [{ type: 'text', value: '</script><script>alert(1)</script>\u2028' }], trees: {}, settled: true, live: false, why: [], drawnWith: [] }, null);
check('a tree cannot close the element its snapshot rides in', (hostile.match(/<\/script>/g) ?? []).length === 1 && !hostile.includes('\u2028'));

await integrations.close();
report('the page, drawn on the server');
