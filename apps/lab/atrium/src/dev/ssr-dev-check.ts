// SSR DEV CHECK — the page is drawn in DEV too, and stays a vite page.
//
// `pnpm dev` is `nisc dev`: vite, with the app server inside it (moss's dev
// plugin, fed from nisc.config.ts). This runs that command on a port of its
// own, with no browser, asks it for the page the way a browser would, and
// stops it. It ran vite on vite.config.ts alone while that file carried a
// server plugin of its own; what a developer runs is the command.
//
//   1. `/` is drawn by the app server — and still carries vite's client and
//      React's refresh preamble, so a drawn page hot-reloads like any other
//   2. the dev sign-in (`/dev/as/<name>`) leaves the token where the wire keeps
//      it AND in the cookie the page is drawn by, and is not answered to a
//      page of another site
//   3. `/` with that cookie is that person's screen, and nothing may keep it
//   4. the browser's entry still loads through vite (src/main.tsx transforms)
//   5. a path one of the manifest's pages answers (`/about`) is drawn too, and a
//      path that is nobody's stays vite's to answer
import './no-llm';
import { spawn } from 'node:child_process';
import { createServer as createTcp } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

// A port nothing holds, asked of the system and given back.
const freePort = (): Promise<number> =>
  new Promise((found, failed) => {
    const probe = createTcp();
    probe.once('error', failed);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address !== null && typeof address === 'object' ? found(address.port) : failed(new Error('ssr-dev-check: no port'))));
    });
  });

// `nisc dev`, as `pnpm dev` runs it. `BROWSER=none`: vite.config.ts opens a
// browser, and a check has none.
const port = await freePort();
const dev = spawn(process.execPath, [resolve(root, 'node_modules/@niscorp/cli/bin/nisc.js'), 'dev', '--port', String(port)], { cwd: root, env: { ...process.env, BROWSER: 'none' }, stdio: 'ignore' });
const base = `http://localhost:${port}`;

// Waited for on the server itself: it is asked until it answers. The limit is
// how long a boot that never comes up takes to say so.
const answering = async (): Promise<boolean> => {
  for (const started = Date.now(); Date.now() - started < 60_000; ) {
    if (dev.exitCode !== null) return false;
    const up = await fetch(`${base}/catalog`).then(
      (answer) => answer.status < 500,
      () => false,
    );
    if (up) return true;
    await new Promise((again) => setTimeout(again, 250));
  }
  return false;
};
if (!(await answering())) {
  dev.kill();
  throw new Error('ssr-dev-check: `nisc dev` did not come up');
}

try {
  // ── 1. nobody asking, through vite ──
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check('`/` in dev is drawn by the app server', /<div id="root"><[a-z]/.test(html) && html.includes('id="nisc-snapshot"'));
  check('…and is still a vite page: vite’s client and React’s refresh preamble are in it', html.includes('/@vite/client') && html.includes('@react-refresh'));
  check('…and still loads the app’s own entry', html.includes('/src/main.tsx'));
  check('…kept apart on the cookie', page.headers.get('vary') === 'Cookie');

  // ── 2. the dev sign-in ──
  const handoff = await fetch(`${base}/dev/as/amara`, { redirect: 'manual' });
  // what a browser would send back: the pairs the answer set
  const hersCookie = handoff.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');
  check(
    'the dev sign-in puts the session in the browser’s own cookie, which no script can read, and hands the page nothing',
    handoff.status === 302 && handoff.headers.getSetCookie().some((line) => line.startsWith(`nisc.token.${new URL(base).port}=`) && line.includes('; HttpOnly')) && (await handoff.text()) === '',
  );
  // A browser says which site started a request. Another site's page that
  // sends this browser here is refused, and nobody is signed in.
  const fromAnotherSite = await fetch(`${base}/dev/as/amara`, { redirect: 'manual', headers: { 'sec-fetch-site': 'cross-site' } });
  check('…and is not answered to a page of another site', fromAnotherSite.status === 403 && fromAnotherSite.headers.getSetCookie().length === 0);

  // ── 3. somebody asking, through vite ──
  const hers = await fetch(`${base}/`, { headers: { cookie: hersCookie } });
  const herHtml = await hers.text();
  check('`/` with that cookie is her screen', herHtml.includes('A word from the desk') && !html.includes('A word from the desk'));
  check('…which nothing may keep', hers.headers.get('cache-control') === 'private, no-store');
  check('…with the palette in the markup', /<html[^>]* data-accent="/.test(herHtml));

  // ── 4. the entry still transforms ──
  const entry = await fetch(`${base}/src/main.tsx`);
  const source = await entry.text();
  check('the browser entry still loads through vite, and starts the wire from the page', entry.ok && source.includes('readDocumentSnapshot'));

  // ── 5. a page, through vite ──
  const about = await fetch(`${base}/about`);
  const aboutHtml = await about.text();
  check('`/about` in dev is drawn by its page, and is still a vite page', aboutHtml.includes('A guest-and-staff platform for hotels') && aboutHtml.includes('/@vite/client') && aboutHtml.includes('"live":false'));
  const hersAbout = await (await fetch(`${base}/about`, { headers: { cookie: hersCookie } })).text();
  check('…with her cookie it names her, and without it names nobody', hersAbout.includes('Signed in as') && !aboutHtml.includes('Signed in as'));
  const asset = await fetch(`${base}/src/ui/css/theme.css`);
  check('a path that is nobody’s page is still vite’s to answer', asset.ok && !(await asset.text()).includes('nisc-snapshot'));
} finally {
  dev.kill();
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? `\nOK — the page, drawn in dev (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in the page, drawn in dev`);
process.exit(failed === 0 ? 0 : 1);
