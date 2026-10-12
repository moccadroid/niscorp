import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { ttyTarget } from '@niscorp/moss/terminal/tty';
import { boot } from '../server/boot';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];
const until = (pred: () => boolean, why: string, ms = 15000): Promise<void> =>
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

  const token = mintToken('alex');
  if (token === null) throw new Error('no alex user');
  const tokenFile = join(mkdtempSync(join(tmpdir(), 'relay-tty-terminal-')), 'token');
  writeFileSync(tokenFile, token, 'utf8');

  const wire = createWire({ env: nodeEnv({ url: `ws://127.0.0.1:${address.port}/socket`, tokenFile }) });

  const input = new PassThrough();
  const output = new PassThrough();
  let screen = '';
  output.on('data', (chunk: Buffer) => (screen += chunk.toString()));

  const terminal = createTerminal({ target: ttyTarget({ input, output, debounceMs: 0 }), wire });

  await until(() => screen.includes('── sidebar') && screen.includes('Deals'), 'sidebar renders as text');
  checks.push(['the sidebar renders as text over the wire (zero React, zero DOM)', screen.includes('── sidebar')]);

  const marker = screen.split('\n').map((line) => /\[(\d+)\][^\n]*Deals/.exec(line)).find((match) => match !== null);
  checks.push(['the Deals nav prints an actionable [n] marker', marker !== undefined]);
  if (marker === undefined) throw new Error('no Deals marker on screen');

  const deal = (await runtime.db.query('SELECT title FROM deals LIMIT 1')).rows[0] as { title: string };
  input.write(`click ${marker[1]}\n`);

  await until(() => screen.includes(deal.title), 'deals list after nav command');
  checks.push([`typing "click ${marker[1]}" round-trips: the deals list renders live ("${deal.title}")`, screen.includes(deal.title)]);
  const dealLine = screen.split('\n').find((line) => line.includes(deal.title));
  checks.push(['deal rows carry their own [n] markers (rowRef intact)', /\[\d+\]/.test(dealLine ?? '')]);

  terminal.destroy();
  wire.dispose();
  httpServer.close();
  await new Promise((r) => setTimeout(r, 150));
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
  console.log('\nOK — a REPL terminal renders and drives the real app from the same server.');
  process.exit(0);
};

void main();
