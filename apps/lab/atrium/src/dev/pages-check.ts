// PAGES CHECK — `/about` is a page (src/app/pages.ts): drawn for whoever asks,
// kept by nothing, and standing beside the app rather than inside it.
//
//   1. nobody asking: the page's words, nothing that says who is looking, and
//      nothing left to happen — so its terminal opens no socket at all
//   2. somebody asking: the same page with the strip that names them, because
//      that strip is an action they are granted — theirs alone, never kept
//   3. …and still no shell: being signed in did not make the page need one
//   4. the app is untouched by any of it: `/` is still the app's own screen
//   5. as files: only ever the page as nobody sees it, each with an account of
//      whether it can still do anything
import { exportDocuments } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import { mintToken, userByUsername } from '@atrium/server/users';
import { renderPage } from '@atrium/server/document';
import { buildRegistry } from '@atrium/ui/registry';
import { TEMPLATE, openPage, snapshotIn } from './drawn-page';
import { check, integrations, report, server } from './world';

const WORDS = 'A guest-and-staff platform for hotels';

// ── 1. nobody asking ──
const page = await renderPage({ server, template: TEMPLATE, path: '/about', cookie: null });
check('nobody asking: /about is drawn by its page, with the page’s words', page.page === 'about' && page.html.includes(WORDS));
check('…and nothing on it says who is looking', !page.html.includes('Signed in as'));
check('…nothing on it can still happen', page.live === false && snapshotIn(page.html).live === false);
check('…a cache may keep it', page.headers['cache-control'] === 'no-cache' && page.headers['vary'] === 'Cookie');

const stranger = await openPage(page.html, null);
check(`its terminal adopts the page (${stranger.complaints.length} complaints)`, stranger.complaints.length === 0 && stranger.unchanged);
check('…and opens no socket: there is nothing to serve it', stranger.sockets.length === 0 && stranger.status() === 'static');

// ── 2. somebody asking ──
// Theo, who has opened nothing: whatever shell exists for him after this was
// built by this.
const token = mintToken('theo');
const theo = userByUsername('theo');
if (token === null || theo === undefined) throw new Error('pages-check: no token for theo');
const his = await renderPage({ server, template: TEMPLATE, path: '/about', cookie: `nisc.token=${encodeURIComponent(token)}` });
check('somebody asking: the same page', his.html.includes(WORDS) && his.page === 'about');
check('…with the strip that names them — an action they are granted', his.html.includes('Signed in as') && his.principal === theo.id);
check('…theirs alone: nothing may keep it', his.headers['cache-control'] === 'private, no-store');

// ── 3. and still no shell ──
check('being signed in did not make the page need a shell', his.live === false);
check('…and none was built: he has no shell on this server', !(server.shells?.list() ?? []).some((shell) => shell.principal === theo.id));
const member = await openPage(his.html, token);
check(`his terminal adopts it and opens no socket (${member.complaints.length} complaints)`, member.complaints.length === 0 && member.unchanged && member.sockets.length === 0);

// ── 4. the app is untouched ──
const app = await renderPage({ server, template: TEMPLATE, path: '/', cookie: null });
check('`/` is still the app’s own screen, and still live', app.page === undefined && app.live === true && !app.html.includes(WORDS));
check('a path that is nobody’s page is the app’s', (await renderPage({ server, template: TEMPLATE, path: '/about/more', cookie: null })).page === undefined);

// ── 5. as files ──
const registry = buildRegistry();
const files = await exportDocuments({ server, template: TEMPLATE, paths: ['/about', '/'], draw: (snapshot) => renderSnapshot({ snapshot, registry }) });
const about = files.find((file) => file.path === '/about');
const root = files.find((file) => file.path === '/');
check('as a file, /about is the page as nobody sees it, and is finished', about !== undefined && about.html.includes(WORDS) && !about.html.includes('Signed in as') && about.live === false && about.drawn);
check('…and `/` is written too, saying why it cannot stand alone', root !== undefined && root.live === true && root.why.some((reason) => reason.startsWith('auth.login:')));

await integrations.close();
report('pages');
