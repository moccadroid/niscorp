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
import { sessionCookies } from '@niscorp/moss';
import { drawing } from '@atrium/server/document';
import { check, integrations, report, server } from './world';

const CHROME = process.env['CHROME'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
if (!existsSync(CHROME)) throw new Error(`browser-probe: no Chrome at ${CHROME} — set CHROME to a Chromium binary`);
if (!existsSync(join(dist, 'index.html'))) throw new Error('browser-probe: no built terminal — run `pnpm --filter atrium build` first');

server.get('/__as/:who', (c) => {
  const token = mintToken(c.req.param('who'));
  if (token === null) return c.text('no such person', 404);
  for (const cookie of sessionCookies(c.req.raw, token)) c.header('set-cookie', cookie, { append: true });
  return c.redirect(c.req.query('to') ?? '/');
});
mountSite(server, { dist, ...drawing });
const httpServer = serve({ fetch: server.fetch, port: 0 });
// Recorded as each socket is accepted rather than polled for: under a virtual
// clock the browser is gone milliseconds after it connects.
const upgrades: string[] = [];
const seated: string[][] = [];
attachSocket(
  httpServer,
  Object.assign(
    async (url: string, connection: Parameters<typeof server.socket>[1]): Promise<void> => {
      upgrades.push(url);
      await server.socket(url, connection);
      seated.push((server.shells?.list() ?? []).filter((shell) => shell.connections > 0).map((shell) => String(shell.principal)));
    },
    { stop: () => server.socket.stop() },
  ),
);
await new Promise<void>((resolveListening) => httpServer.once('listening', () => resolveListening()));
const base = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

type Visit = { dom: string; console: string[]; attached: boolean; sockets: string[] };

const visit = async (path: string, watch?: string): Promise<Visit> => {
  const profile = await mkdtemp(join(tmpdir(), 'atrium-chrome-'));
  const before = upgrades.length;
  const seatedBefore = seated.length;
  try {
    const args = ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--enable-logging=stderr', '--v=0', '--virtual-time-budget=6000', '--dump-dom', `${base}${path}`];
    // The error is ignored: Chrome is killed by the timeout if it hangs, and
    // whatever came back is what is read.
    const { dom, log } = await new Promise<{ dom: string; log: string }>((done) => {
      execFile(CHROME, args, { timeout: 40_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 }, (_error, stdout, stderr) => done({ dom: String(stdout), log: String(stderr) }));
    });
    return { dom, console: log.split('\n').filter((line) => line.includes('CONSOLE')), attached: watch !== undefined && seated.slice(seatedBefore).some((principals) => principals.includes(watch)), sockets: upgrades.slice(before) };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
};

const said = (visited: Visit, pattern: RegExp): string[] => visited.console.filter((line) => pattern.test(line));
const COMPLAINT = /hydrat|did not match|didn't match|Minified React error|Uncaught|TypeError|ReferenceError/i;

try {
  const stranger = await visit('/');
  check('a real browser, nobody signed in: the lock screen stands', stranger.dom.includes('nisc-snapshot') && /<div id="root"><[a-z]/.test(stranger.dom));
  check(`…and it said nothing about a mismatch or an error (${said(stranger, COMPLAINT).length})`, said(stranger, COMPLAINT).length === 0);
  check('…and the browser opened one socket, naming the page’s id seed', stranger.sockets.length === 1 && /seed=[0-9a-f]+/.test(stranger.sockets[0] ?? ''));

  const amara = userByUsername('amara');
  if (amara === undefined) throw new Error('browser-probe: no amara');
  const hers = await visit('/__as/amara', amara.id);
  check('signed in: the page is her screen', hers.dom.includes('A word from the desk'));
  check('…with the palette on <html>', /<html[^>]* data-accent="/.test(hers.dom));
  check(`…adopted with nothing said about a mismatch or an error (${said(hers, COMPLAINT).length})`, said(hers, COMPLAINT).length === 0);
  check('…and that browser opened a socket onto her shell, with her token in no address', hers.attached && hers.sockets.length > 0 && hers.sockets.every((url) => !url.includes('token')));

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
