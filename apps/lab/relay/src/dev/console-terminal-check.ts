// Console-terminal check — the F12 thesis, proven headlessly: the built
// console bundle (dist/console.js, `pnpm console`) is evaluated against a
// fake page (jsdom window, captured console), connects to the real relay
// server, and the ENTIRE login runs on the globals it installs:
// act(1,'alex') → act(2) → act(1) → session grant → authenticated app in
// the console log. Run manually: pnpm console && pnpm exec tsx
// src/dev/console-terminal-check.ts
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from '../server/boot';

const checks: [string, boolean][] = [];
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
  const bundle = readFileSync(new URL('../../dist/console.js', import.meta.url), 'utf8');

  const { server, runtime } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  // The "page": a jsdom window (localStorage for the token) with the wire's
  // url injected the way a user would set it before pasting. Node's global
  // WebSocket carries the socket, same as every headless terminal check.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://some.random.website/' });
  const pageWindow = dom.window as unknown as Record<string, unknown>;
  pageWindow['RELAY_URL'] = `ws://127.0.0.1:${address.port}/socket`;
  Object.assign(globalThis, { window: dom.window });

  // Captured console: the fmt strings, %c styling stripped — the "screen".
  let screen = '';
  const original = { log: console.log, warn: console.warn, table: console.table };
  const capture = (...args: unknown[]): void => {
    const first = args[0];
    if (typeof first === 'string') screen += `${first.replace(/%c/g, '').replace(/%%/g, '%')}\n`;
  };
  console.log = capture as typeof console.log;
  console.warn = capture as typeof console.warn;
  console.table = ((rows: unknown) => void (screen += `${JSON.stringify(rows)}\n`)) as typeof console.table;
  const restore = (): void => Object.assign(console, original) as unknown as void;

  try {
    new Function(bundle)();

    const act = pageWindow['act'] as (n: number, value?: unknown) => void;
    const refs = pageWindow['refs'] as () => void;

    await until(() => screen.includes('Sign in to Relay') && screen.includes('[1]'), 'login frame logs with markers');
    checks.push(['the bundle attaches and the served login logs with [n] markers', true]);
    checks.push(['connection status is reported', screen.includes('✓ connected')]);

    act(1, 'alex');
    act(2);
    await until(() => screen.includes('Magic link sent to alex@relay.app'), 'magic link after act(1,alex) + act(2)');
    checks.push(["act(1,'alex') + act(2) round-trip: the link is addressed to the typed username", true]);

    act(1);
    await until(() => screen.includes('Deals'), 'authenticated app after act(1)');
    checks.push(['act(1) redeems: the wire reconnects authenticated, the app logs', true]);

    refs();
    checks.push(['refs() tables the interactives', screen.includes('"ref":"nav-deals"') || screen.includes('nav-deals')]);

    const token = (dom.window.localStorage as Storage).getItem('relay.console.token');
    checks.push(['the token landed in the page-origin localStorage', token !== null && token.length > 0]);

    (pageWindow['relayQuit'] as () => void)();
  } finally {
    restore();
  }

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
  console.log('\nOK — a devtools console on a random page logs in and drives the real app.');
  process.exit(0);
};

void main();
