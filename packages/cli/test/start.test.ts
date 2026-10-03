import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// `nisc start` on an app with its own shell — the built command, listening for
// real, asked over a real socket with nothing decoding on the way. What a
// browser may keep of the built folder, and how each answer travels.
// ═══════════════════════════════════════════════════════════════

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'fixtures', 'own-shell');
const bin = join(here, '..', 'bin', 'nisc.js');
const SLOW = 60_000;
// what a browser says it takes
const BROWSER = { 'accept-encoding': 'gzip, deflate, br, zstd' };

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

type Answer = { status: number; headers: IncomingHttpHeaders; bytes: Buffer };

let child: ChildProcess | undefined;
let base = '';
let log = '';

const ask = (path: string, headers: Record<string, string> = BROWSER, method = 'GET'): Promise<Answer> =>
  new Promise((done, fail) => {
    const asked = request(`${base}${path}`, { method, headers }, (answer) => {
      const chunks: Buffer[] = [];
      answer.on('data', (chunk: Buffer) => chunks.push(chunk));
      answer.on('end', () => done({ status: answer.statusCode ?? 0, headers: answer.headers, bytes: Buffer.concat(chunks) }));
    });
    asked.on('error', fail);
    asked.end();
  });

const decoded = (answer: Answer): string => {
  const encoding = answer.headers['content-encoding'];
  return (encoding === 'br' ? brotliDecompressSync(answer.bytes) : encoding === 'gzip' ? gunzipSync(answer.bytes) : answer.bytes).toString();
};

beforeAll(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [bin, 'start', '--root', root, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await ask('/robots.txt')).status === 200) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`nisc start did not come up:\n${log}`);
    await pause(150);
  }
}, SLOW);

afterAll(async () => {
  child?.kill('SIGTERM');
  await pause(200);
});

describe('nisc start — what a browser may keep, and how it travels', () => {
  it('what is under assets/ is kept for a year, and goes out compressed', async () => {
    const answer = await ask('/assets/app.js');
    expect(answer.status).toBe(200);
    expect(answer.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers['vary']).toBe('Accept-Encoding');
    const file = readFileSync(join(root, 'built', 'assets', 'app.js'), 'utf8');
    expect(decoded(answer)).toBe(file);
    expect(answer.bytes.length).toBeLessThan(file.length / 2);
  });

  it('asked for again, it is the same bytes — compressed once, sent with their length', async () => {
    const [first, second] = [await ask('/assets/app.js'), await ask('/assets/app.js')];
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(second.headers['content-length']).toBe(String(second.bytes.length));
  });

  it('gzip for an asker that takes only that, and the file as it is for one that takes neither', async () => {
    const file = readFileSync(join(root, 'built', 'assets', 'app.js'), 'utf8');
    const gz = await ask('/assets/app.js', { 'accept-encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(decoded(gz)).toBe(file);
    const plain = await ask('/assets/app.js', {});
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.bytes.toString()).toBe(file);
    expect(plain.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('any other file is asked about each time, and answered 304 when it has not changed', async () => {
    const first = await ask('/robots.txt');
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.bytes.toString()).toBe('User-agent: *\nAllow: /\n');
    // 23 bytes: not worth compressing
    expect(first.headers['content-encoding']).toBeUndefined();
    const modified = String(first.headers['last-modified']);
    expect(Number.isNaN(Date.parse(modified))).toBe(false);

    const again = await ask('/robots.txt', { ...BROWSER, 'if-modified-since': modified });
    expect(again.status).toBe(304);
    expect(again.bytes.length).toBe(0);
    expect(again.headers['cache-control']).toBe('no-cache');
  });

  it('the drawn document goes out compressed, and is asked about each time', async () => {
    const answer = await ask('/rooms');
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toContain('text/html');
    expect(answer.headers['cache-control']).toBe('no-cache');
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers['vary']).toBe('Accept-Encoding');
    expect(decoded(answer)).toContain('Rooms &amp; &lt;suites&gt;');
  });

  it('a file that is not there is a 404, and nothing says to keep it', async () => {
    const answer = await ask('/assets/nope.js');
    expect(answer.status).toBe(404);
    expect(answer.headers['cache-control']).toBeUndefined();
  });
});
