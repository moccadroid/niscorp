import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// `nisc dev` on an app behind moss — the moss template, the way a new app
// starts. One process: the app's own vite, with moss's dev plugin fed from the
// app's nisc.config.ts. Nothing about the server is in the app's vite.config.
// ═══════════════════════════════════════════════════════════════

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', 'create-nisc', 'templates', 'moss-react');
const bin = join(here, '..', 'bin', 'nisc.js');
const SLOW = 90_000;

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, () => {
      const address = probe.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      probe.close(() => done(port));
    });
  });

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

let child: ChildProcess | undefined;
let base = '';
let log = '';

const until = async (what: () => boolean | Promise<boolean>, ms: number): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await what()) return true;
    await pause(150);
  }
  return false;
};

beforeAll(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  child = spawn(process.execPath, [bin, 'dev', '--root', root, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  const up = await until(async () => {
    try {
      return (await fetch(`${base}/catalog`)).ok;
    } catch {
      return false;
    }
  }, 60_000);
  if (!up) throw new Error(`nisc dev did not come up:\n${log}`);
}, SLOW);

afterAll(() => {
  child?.kill('SIGTERM');
});

describe('nisc dev — an app behind moss', () => {
  it('serves the app’s own page with its first screen drawn, and still a vite page', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('class="k-heading"');
    expect(html).toContain('id="nisc-snapshot"');
    // vite's client is in it: the drawn page hot-reloads like any other
    expect(html).toContain('/@vite/client');
  }, SLOW);

  it('hands moss’s paths to the app server, and everything else to vite', async () => {
    const catalog: unknown = await (await fetch(`${base}/catalog`)).json();
    expect(JSON.stringify(catalog)).toContain('welcome');
    const entry = await fetch(`${base}/src/main.tsx`);
    expect(entry.ok).toBe(true);
    expect(await entry.text()).toContain('createTerminal');
  }, SLOW);

  it('re-boots the app server when the app’s source changes', async () => {
    const file = join(root, 'src', 'app', 'charter', 'assignments.ts');
    const before = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, `${before}\n`);
      expect(await until(() => log.includes('app server re-booted'), 30_000)).toBe(true);
    } finally {
      writeFileSync(file, before);
    }
    // and the new server answers
    expect((await fetch(`${base}/catalog`)).ok).toBe(true);
  }, SLOW);
});
