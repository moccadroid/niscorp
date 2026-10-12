import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { inkTarget } from '@niscorp/moss/terminal/ink';
import { boot } from '../server/boot';

const checks: [string, boolean][] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const until = (pred: () => boolean, why: string, ms = 20000): Promise<void> =>
  new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (pred()) return res();
      if (Date.now() - t0 > ms) return rej(new Error(`timed out: ${why}`));
      setTimeout(tick, 40);
    };
    tick();
  });

const main = async (): Promise<void> => {
  const { server, runtime } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  // Anonymous on purpose: the token file starts empty and the session grant
  // must fill it.
  const tokenFile = join(mkdtempSync(join(tmpdir(), 'relay-ink-terminal-')), 'token');
  const wire = createWire({ env: nodeEnv({ url: `ws://127.0.0.1:${address.port}/socket`, tokenFile }) });

  // ink gates raw mode on stdin.isTTY and reads via 'readable' + read(), so a
  // PassThrough with these stubs passes for a TTY.
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: (): PassThrough => stdin,
    ref: (): PassThrough => stdin,
    unref: (): PassThrough => stdin,
  });
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 40 });
  let screen = '';
  stdout.on('data', (chunk: Buffer) => (screen += chunk.toString()));

  const terminal = createTerminal({
    target: inkTarget({ stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream }),
    wire,
  });

  await until(() => screen.includes('Sign in to Relay'), 'login canvas renders');
  checks.push(['the served login canvas renders through ink (zero DOM)', screen.includes('Sign in to Relay')]);
  await until(() => screen.includes('[1]') && screen.includes('[2]'), 'markers render');
  checks.push(['interactives carry [n] markers — TTY numbering, full-screen', screen.includes('[1]') && screen.includes('[2]')]);

  stdin.write('1');
  await sleep(600); // digit commit + focus commit
  stdin.write('alex');
  await sleep(400);
  stdin.write('\r');
  await until(() => screen.includes('Magic link sent to alex@relay.app'), 'magic link addressed to the typed username');
  checks.push(['typing `1 alex ⏎` round-trips: the link is addressed to the typed username', true]);

  await sleep(300);
  stdin.write('1');
  await until(() => screen.includes('Deals'), 'authenticated app after redeem');
  checks.push(['typing `1` on the sent stage redeems: the wire reconnects authenticated, the app arrives', screen.includes('Deals')]);
  checks.push(['the granted token landed in the env token file', readFileSync(tokenFile, 'utf8').trim().length > 0]);

  terminal.destroy();
  wire.dispose();
  httpServer.close();
  await sleep(150);
  await runtime.db.close();

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — a full-screen ink terminal logs in and drives the real app on keystrokes alone.');
  process.exit(0);
};

void main();
