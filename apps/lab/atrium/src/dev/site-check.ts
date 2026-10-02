// SITE CHECK — the deployment's half of the drawn page: what `nisc start` mounts
// (moss's `mountSite`, with this app's drawing) over a built terminal, asked the
// way a browser asks.
//
//   1. `/` is index.html with the caller's screen drawn into it, and its headers
//      follow from who asked
//   2. a path one of the manifest's pages answers is drawn by that page
//   3. a built file is still a file — and index.html never goes out undrawn
//   4. nothing moss answers is shadowed
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintToken } from '@atrium/server/users';
import { mountSite } from '@niscorp/moss/node';
import { drawing } from '@atrium/server/document';
import { check, integrations, report, server } from './world';

const dist = await mkdtemp(join(tmpdir(), 'atrium-dist-'));
await mkdir(join(dist, 'assets'));
await writeFile(join(dist, 'index.html'), '<!doctype html><html lang="en"><head><title>Atrium</title></head><body><div id="root"></div><script type="module" src="/assets/main.js"></script></body></html>');
await writeFile(join(dist, 'assets', 'main.js'), 'console.log("the built terminal");');
mountSite(server, { dist, ...drawing });

try {
  // ── 1. the app's page ──
  const anonymous = await server.request('/');
  const anonymousHtml = await anonymous.text();
  check('`/` is index.html with the screen drawn into it', anonymous.status === 200 && /<div id="root"><[a-z]/.test(anonymousHtml) && anonymousHtml.includes('/assets/main.js'));
  check('…for nobody: a cache may keep it, told apart on the cookie', anonymous.headers.get('cache-control') === 'no-cache' && anonymous.headers.get('vary') === 'Cookie');

  const token = mintToken('amara');
  const hers = await server.request('/', { headers: { cookie: `nisc.token=${encodeURIComponent(token ?? '')}` } });
  const herHtml = await hers.text();
  check('…for somebody: their screen, which nothing may keep', herHtml.includes('A word from the desk') && hers.headers.get('cache-control') === 'private, no-store');

  // ── 2. a page ──
  const about = await server.request('/about');
  const aboutHtml = await about.text();
  check('`/about` is drawn by its page', about.status === 200 && aboutHtml.includes('A guest-and-staff platform for hotels') && aboutHtml.includes('"live":false'));

  // ── 3. files ──
  const asset = await server.request('/assets/main.js');
  check('a built file is still a file', asset.status === 200 && (await asset.text()).includes('the built terminal'));
  const index = await server.request('/index.html');
  check('index.html never goes out undrawn', /<div id="root"><[a-z]/.test(await index.text()));

  // ── 4. moss's own surfaces ──
  const catalog = await server.request('/catalog');
  check('`/catalog` is still moss’s', catalog.headers.get('content-type')?.includes('application/json') === true);
  const missing = await server.request('/api/nothing-here');
  check('an unknown path under `/api` is not answered with a page', !(await missing.text()).includes('nisc-snapshot'));
} finally {
  await rm(dist, { recursive: true, force: true });
}

await integrations.close();
report('the built terminal, served drawn');
