import { PROTOCOL } from '@niscorp/moss/protocol';
import type { RenderNode } from '@niscorp/nova';
import { mintToken } from '@atrium/server/users';
import { renderPage } from '@atrium/server/document';
import { TEMPLATE, openPage, snapshotIn } from './drawn-page';
import { check, integrations, report, server } from './world';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const anonymous = await renderPage({ server, template: TEMPLATE, path: '/', cookie: null });
const anonymousSnapshot = snapshotIn(anonymous.html);
check('nobody asking: the page is drawn (the lock screen is in the markup)', /<div id="root"><[a-z]/.test(anonymous.html) && !anonymous.html.includes('<div id="root"></div>'));
check('…it says it was drawn for nobody, and under an id seed', anonymousSnapshot.principal === false && typeof anonymousSnapshot.seed === 'string');
check('…a cache may keep it, and must tell it apart on the cookie', anonymous.headers['cache-control'] === 'no-cache' && anonymous.headers['vary'] === 'Cookie');

const stranger = await openPage(anonymous.html, null);
check(`its terminal adopts the page as it stands (${stranger.complaints.length} complaints)`, stranger.complaints.length === 0 && stranger.unchanged);
check('…and names the page’s seed on the socket', anonymousSnapshot.seed !== undefined && (stranger.sockets[0] ?? '').includes(`seed=${anonymousSnapshot.seed}`));
{
  const frames: string[] = [];
  let closed: (() => void) | undefined;
  await server.socket(`/socket?protocol=${PROTOCOL}&seed=${anonymousSnapshot.seed ?? ''}`, { send: (text) => void frames.push(text), close: () => undefined, onMessage: () => undefined, onClose: (fn) => void (closed = fn) });
  await sleep(150);
  const renders = frames.map((text) => JSON.parse(text) as { type: string; canvas?: string; tree?: RenderNode[] }).filter((message) => message.type === 'render');
  const same = renders.length > 0 && renders.every((message) => JSON.stringify(message.tree) === JSON.stringify(anonymousSnapshot.trees[message.canvas ?? '']));
  check(`the socket’s first frames are the page’s own trees, ids included (${renders.length} canvases)`, same);
  closed?.();
}

const token = mintToken('amara');
if (token === null) throw new Error('ssr-check: no token for amara');
const hers = await renderPage({ server, template: TEMPLATE, path: '/', cookie: `theme=dark; nisc.token=${encodeURIComponent(token)}` });
const herSnapshot = snapshotIn(hers.html);
// Her concierge, not her name: the lock screen names everybody.
check('somebody asking: their screen is drawn (her concierge is in the markup, and was not in nobody’s)', hers.html.includes('A word from the desk') && !anonymous.html.includes('A word from the desk'));
check('…it says it was drawn for somebody, with no seed (her shell is the one the socket attaches to)', herSnapshot.principal === true && herSnapshot.seed === undefined);
check('…nothing may keep it', hers.headers['cache-control'] === 'private, no-store');
check('…the property’s palette is in the markup, before any script', /<html[^>]* data-accent="[a-z0-9-]+"/.test(hers.html));

const guest = await openPage(hers.html, token);
check(`her terminal adopts it too (${guest.complaints.length} complaints)`, guest.complaints.length === 0 && guest.unchanged);

let threw = false;
try {
  guest.press();
} catch {
  threw = true;
}
check('a press before the socket is open is dropped — nothing thrown, nothing sent', !threw && guest.sent.length === 0);

const mismatched = await openPage(hers.html, null);
check('a terminal holding no token does not start from somebody’s page (it is replaced, not adopted)', !mismatched.unchanged);

const dead = await renderPage({ server, template: TEMPLATE, path: '/', cookie: 'nisc.token=not-a-token' });
check('a dead cookie is the lock screen', snapshotIn(dead.html).principal === false && snapshotIn(dead.html).seed !== undefined && !dead.html.includes('A word from the desk'));
check('…and a page request writes no cookie: the upgrade is where one is set and taken back', dead.headers['set-cookie'] === undefined);

const hostilePath = '/</script><script>alert(1)</script>\u2028';
const hostile = await renderPage({ server, template: TEMPLATE, path: hostilePath, cookie: null });
const closings = (html: string): number => (html.match(/<\/script>/g) ?? []).length;
check(
  'a path cannot close the element its snapshot rides in',
  hostile.drawn && snapshotIn(hostile.html).path === hostilePath && closings(hostile.html) === closings(anonymous.html) && !hostile.html.includes('\u2028'),
);

await integrations.close();
report('the page, drawn on the server');
