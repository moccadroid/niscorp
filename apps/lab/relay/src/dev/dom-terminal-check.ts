// DOM-terminal check — the swappable-terminal thesis, proven headlessly: a
// terminal with ZERO React renders the real relay app from the same moss
// server, and a click round-trips. moss's plain-DOM target (nova/dom + the
// default kit) drives a jsdom DOM over the real wire; we assert relay content
// appears as DOM and that clicking a nav dispatches → the server re-renders →
// the deals list arrives. Same server as host-check; a different terminal.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { boot } from '../server/boot';
import { mintToken } from '../server/users';

// A DOM for nova/dom to render into — jsdom supplies document + the element
// classes `instanceof` needs. The wire itself is host-free: it runs on
// `nodeEnv` (token file + Node's own WebSocket), the way a TTY terminal will.
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  KeyboardEvent: window.KeyboardEvent,
  Node: window.Node,
});

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

  // Authenticate as alex (sales + dev) — the token rides the env's token
  // file, the way a TTY process holds it; the wire reads it on connect.
  const token = mintToken('alex');
  if (token === null) throw new Error('no alex user');
  const tokenFile = join(mkdtempSync(join(tmpdir(), 'relay-dom-terminal-')), 'token');
  writeFileSync(tokenFile, token, 'utf8');

  const wire = createWire({ env: nodeEnv({ url: `ws://127.0.0.1:${address.port}/socket`, tokenFile }) });
  const root = window.document.getElementById('root')!;
  const terminal = createTerminal({ target: domTarget({ root }), wire });

  const text = (): string => root.textContent ?? '';
  const has = (sel: string): boolean => root.querySelector(sel) !== null;

  // ── the app renders as plain DOM ──
  await until(() => has('[data-canvas="sidebar"]') && text().length > 30, 'sidebar renders');
  checks.push(['the sidebar renders as plain DOM over the wire', has('[data-canvas="sidebar"]')]);
  checks.push(['nav items render and carry their ref (nav-deals present, zero React)', has('[data-ref="nav-deals"]')]);
  checks.push(['the kit maps universal primitives to semantic elements (a real <button>)', has('button[data-component="Button"]')]);

  // ── a click round-trips: DOM click → ui:click → server navigates main ──
  const deal = (await runtime.db.query('SELECT title FROM deals LIMIT 1')).rows[0] as { title: string };
  const navDeals = root.querySelector('[data-ref="nav-deals"]') as HTMLElement | null;
  if (navDeals === null) throw new Error('nav-deals element missing');
  navDeals.click(); // jsdom dispatches a click → the renderer's ui:click listener fires

  await until(() => text().includes(deal.title), 'deals list after nav click');
  checks.push([`clicking a nav in the DOM terminal round-trips: the deals list renders live ("${deal.title}")`, text().includes(deal.title)]);
  checks.push(['the deals table rendered as a real <table>', has('table')]);

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
  console.log('\nOK — a zero-React DOM terminal renders and drives the real app from the same server.');
  process.exit(0);
};

void main();
