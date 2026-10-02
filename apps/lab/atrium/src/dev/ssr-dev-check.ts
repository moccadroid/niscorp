// SSR DEV CHECK — the page is drawn in DEV too, and stays a vite page.
//
// `pnpm dev` runs the app server inside vite (vite.config.ts). This boots that
// same config on a port of its own, with no browser, asks it for the page the
// way a browser would, and closes it:
//
//   1. `/` is drawn by the app server — and still carries vite's client and
//      React's refresh preamble, so a drawn page hot-reloads like any other
//   2. the dev sign-in (`/dev/as/<name>`) leaves the token where the wire keeps
//      it AND in the cookie the page is drawn by
//   3. `/` with that cookie is that person's screen, and nothing may keep it
//   4. the browser's entry still loads through vite (src/main.tsx transforms)
//   5. a path one of the manifest's pages answers (`/about`) is drawn too, and a
//      path that is nobody's stays vite's to answer
import './no-llm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

const vite = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'silent', server: { port: 0, open: false, strictPort: false } });
await vite.listen();
const address = vite.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('ssr-dev-check: vite did not listen');
const base = `http://localhost:${address.port}`;

try {
  // ── 1. nobody asking, through vite ──
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check('`/` in dev is drawn by the app server', /<div id="root"><[a-z]/.test(html) && html.includes('id="nisc-snapshot"'));
  check('…and is still a vite page: vite’s client and React’s refresh preamble are in it', html.includes('/@vite/client') && html.includes('@react-refresh'));
  check('…and still loads the app’s own entry', html.includes('/src/main.tsx'));
  check('…kept apart on the cookie', page.headers.get('vary') === 'Cookie');

  // ── 2. the dev sign-in ──
  const handoff = await (await fetch(`${base}/dev/as/amara`)).text();
  const token = /localStorage\.setItem\('nisc\.token',"([^"]+)"\)/.exec(handoff)?.[1];
  check('the dev sign-in hands the token to the wire and to the cookie', token !== undefined && handoff.includes("document.cookie='nisc.token='"));

  // ── 3. somebody asking, through vite ──
  const hers = await fetch(`${base}/`, { headers: { cookie: `nisc.token=${encodeURIComponent(token ?? '')}` } });
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
  const hersAbout = await (await fetch(`${base}/about`, { headers: { cookie: `nisc.token=${encodeURIComponent(token ?? '')}` } })).text();
  check('…with her cookie it names her, and without it names nobody', hersAbout.includes('Signed in as') && !aboutHtml.includes('Signed in as'));
  const asset = await fetch(`${base}/src/ui/css/theme.css`);
  check('a path that is nobody’s page is still vite’s to answer', asset.ok && !(await asset.text()).includes('nisc-snapshot'));
} finally {
  await vite.close();
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? `\nOK — the page, drawn in dev (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in the page, drawn in dev`);
process.exit(failed === 0 ? 0 : 1);
