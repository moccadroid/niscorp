// THE DRAWN PAGE, IN A REAL BROWSER — a probe, not a check: it needs Chrome on
// this machine and a built terminal (`pnpm --filter atrium build`), so it is not
// in the suite. ssr-check holds the same claims under jsdom; this is the one
// place they are held by a browser's own parser, its own WebSocket and its own
// cookie jar.
//
// It serves the built terminal the way `nisc start` does (moss's `mountSite`)
// on a port of its own, signs a person in through a route only this probe has,
// lets headless Chrome load the page, and reads three things back:
//
//   - what the page said on its console (a hydration complaint is said there)
//   - the page's elements once it settled
//   - whether that browser opened a socket onto her shell
//
// Run: pnpm --filter atrium exec tsx src/dev/browser-probe.ts
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintToken, userByUsername } from '@atrium/server/users';
import { mountSite } from '@niscorp/moss/node';
import { drawing } from '@atrium/server/document';
import { check, integrations, report, server } from './world';

const CHROME = process.env['CHROME'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
if (!existsSync(CHROME)) throw new Error(`browser-probe: no Chrome at ${CHROME} — set CHROME to a Chromium binary`);
if (!existsSync(join(dist, 'index.html'))) throw new Error('browser-probe: no built terminal — run `pnpm --filter atrium build` first');

// The probe's own way in: the token where the wire keeps it and in the cookie
// copy, then on to the page — what the dev server's `/dev/as/<name>` does.
server.get('/__as/:who', (c) => {
  const token = mintToken(c.req.param('who'));
  const to = c.req.query('to') ?? '/';
  if (token === null) return c.text('no such person', 404);
  return c.html(`<script>localStorage.setItem('nisc.token',${JSON.stringify(token)});document.cookie='nisc.token='+encodeURIComponent(${JSON.stringify(token)})+'; Path=/; SameSite=Lax';location.replace(${JSON.stringify(to)})</script>`);
});
mountSite(server, { dist, ...drawing });
const httpServer = serve({ fetch: server.fetch, port: 0 });
// Every socket a browser opens, by its url — what "it opened none" is held by.
const upgrades: string[] = [];
attachSocket(
  httpServer,
  Object.assign(
    async (url: string, connection: Parameters<typeof server.socket>[1]): Promise<void> => {
      upgrades.push(url);
      return server.socket(url, connection);
    },
    { stop: () => server.socket.stop() },
  ),
);
await new Promise<void>((resolveListening) => httpServer.once('listening', () => resolveListening()));
const base = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

type Visit = { dom: string; console: string[]; attached: boolean; sockets: string[] };

// One page load in a fresh profile. `watch`: a principal whose shell should gain
// a terminal while the browser is up.
const visit = async (path: string, watch?: string): Promise<Visit> => {
  const profile = await mkdtemp(join(tmpdir(), 'atrium-chrome-'));
  let attached = false;
  const before = upgrades.length;
  const poll = setInterval(() => {
    if (watch !== undefined && (server.shells?.list() ?? []).some((shell) => shell.principal === watch && shell.connections > 0)) attached = true;
  }, 25);
  try {
    const args = ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--enable-logging=stderr', '--v=0', '--virtual-time-budget=6000', '--dump-dom', `${base}${path}`];
    // The callback form: the page's markup on stdout, the browser's log on stderr.
    // An exit code is not a verdict here (Chrome is killed by the timeout if it
    // hangs), so whatever came back is what is read.
    const { dom, log } = await new Promise<{ dom: string; log: string }>((done) => {
      execFile(CHROME, args, { timeout: 40_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 }, (_error, stdout, stderr) => done({ dom: String(stdout), log: String(stderr) }));
    });
    return { dom, console: log.split('\n').filter((line) => line.includes('CONSOLE')), attached, sockets: upgrades.slice(before) };
  } finally {
    clearInterval(poll);
    await rm(profile, { recursive: true, force: true });
  }
};

const said = (visited: Visit, pattern: RegExp): string[] => visited.console.filter((line) => pattern.test(line));
const COMPLAINT = /hydrat|did not match|didn't match|Minified React error|Uncaught|TypeError|ReferenceError/i;

try {
  // ── nobody: the lock screen ──
  const stranger = await visit('/');
  check('a real browser, nobody signed in: the lock screen stands', stranger.dom.includes('nisc-snapshot') && /<div id="root"><[a-z]/.test(stranger.dom));
  check(`…and it said nothing about a mismatch or an error (${said(stranger, COMPLAINT).length})`, said(stranger, COMPLAINT).length === 0);
  check('…and the browser opened one socket, naming the page’s id seed', stranger.sockets.length === 1 && /seed=[0-9a-f]+/.test(stranger.sockets[0] ?? ''));

  // ── somebody: her own screen, adopted, then live ──
  const amara = userByUsername('amara');
  if (amara === undefined) throw new Error('browser-probe: no amara');
  const hers = await visit('/__as/amara', amara.id);
  check('signed in: the page is her screen', hers.dom.includes('A word from the desk'));
  check('…with the palette on <html>', /<html[^>]* data-accent="/.test(hers.dom));
  check(`…adopted with nothing said about a mismatch or an error (${said(hers, COMPLAINT).length})`, said(hers, COMPLAINT).length === 0);
  check('…and that browser opened a socket onto her shell, carrying her token', hers.attached && hers.sockets.some((url) => url.includes('token=')));

  // ── a page: drawn, adopted, and no socket asked for ──
  const about = await visit('/about');
  check('`/about`: the page’s words stand', about.dom.includes('A guest-and-staff platform for hotels'));
  check(`…with nothing said about a mismatch or an error (${said(about, COMPLAINT).length})`, said(about, COMPLAINT).length === 0);
  check(`…and the browser opened no socket at all: the page needs none (${about.sockets.length})`, about.sockets.length === 0);
  const herAbout = await visit('/__as/amara?to=/about', amara.id);
  check('`/about`, signed in: it names her', herAbout.dom.includes('Signed in as'));
  check(`…and her browser opened no socket for it either (${herAbout.sockets.length})`, herAbout.sockets.length === 0);
  for (const line of [...said(stranger, COMPLAINT), ...said(hers, COMPLAINT), ...said(about, COMPLAINT)].slice(0, 5)) console.log(`   ${line.slice(0, 300)}`);
} finally {
  httpServer.close();
}

await integrations.close();
report('the drawn page, in a real browser');
