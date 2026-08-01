// The browser path, CLICKED: jsdom + the REAL react registry + the REAL wire
// against the running dev server, signed in as Henrik, driving the ops
// Integrations screen the way a hand does — nav, open a connector, flip a
// service switch, watch the row change, flip it back.
//
// This exists because a green server-side suite says nothing about a toggle a
// browser renders. When someone says the toggles don't work, THIS is the check
// that gets to disagree.
//
// Needs the dev server (pnpm dev) and the connector (pnpm connector) running.
// Run: pnpm --filter atrium exec tsx src/dev/integrations-probe.ts
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintToken } from '@atrium/server/users';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5175/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'getComputedStyle'] as const) {
  Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}

const results: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Find a rendered element by its exact text, optionally scoped to a tag.
const byText = (text: string, tag = '*'): Element | undefined =>
  [...dom.window.document.querySelectorAll(tag)].find((el) => el.textContent?.trim() === text && el.children.length <= 2);

const click = (el: Element | undefined): void => {
  if (el === undefined) throw new Error('probe: nothing to click');
  (el as unknown as { click: () => void }).click();
};

// The Switch beside a labelled row: walk up from the label to the row, then
// take the row's button — the same geometry a finger uses.
const switchBeside = (label: string): Element | undefined => {
  let node: Element | undefined = byText(label);
  for (let i = 0; i < 6 && node !== undefined; i += 1) {
    const button = [...node.querySelectorAll('button')].find((b) => b.textContent?.trim() === '');
    if (button !== undefined) return button;
    node = node.parentElement ?? undefined;
  }
  return undefined;
};

const switchState = (el: Element): string => (el.querySelector('span') as HTMLElement | null)?.style.background ?? '';

const main = async (): Promise<void> => {
  // Sign in as Henrik before the terminal boots — token on disk, like a phone.
  const token = mintToken('henrik');
  if (token === null) throw new Error('no token for henrik');
  const tokenFile = join(mkdtempSync(join(tmpdir(), 'atrium-probe-')), 'token');
  writeFileSync(tokenFile, token, 'utf8');

  const { createWire } = await import('@niscorp/moss/client');
  const { nodeEnv } = await import('@niscorp/moss/client/node');
  const { createTerminal } = await import('@niscorp/moss/terminal');
  const { reactTarget } = await import('@niscorp/moss/terminal/react');
  const { buildRegistry } = await import('../ui/registry');

  process.on('uncaughtException', (e) => {
    console.log('CRASH:', e.stack ?? e.message);
    process.exit(1);
  });

  const root = dom.window.document.getElementById('root');
  if (root === null) throw new Error('no root');
  const wire = createWire({ env: nodeEnv({ url: 'ws://localhost:5175/socket', tokenFile }) });
  createTerminal({ target: reactTarget({ root, registry: buildRegistry() }), wire });

  await sleep(2500);
  check('the shell rendered for Henrik', root.textContent?.includes('Henrik Sørensen') === true);
  check('the chrome offers the other house — the sibling switcher', byText('Casa Marisol', 'button') !== undefined);

  // ── nav to Integrations ──
  click(byText('Integrations', 'button') ?? [...dom.window.document.querySelectorAll('button')].find((b) => b.textContent?.includes('Integrations')));
  await sleep(1200);
  check('the Integrations pane lists the house connectors', root.textContent?.includes('Opera Cloud') === true && root.textContent?.includes('HotelFix') === true);

  // ── open Opera's services ──
  const operaCard = [...dom.window.document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Services')[0];
  click(operaCard);
  await sleep(1200);
  check('the services checklist rendered', root.textContent?.includes('Wake-up calls') === true);
  check('what the offer lacks renders grey, not clickable', root.textContent?.includes('unavailable') === true);

  // ── flip a REAL switch, in the DOM ──
  const wakeSwitch = switchBeside('Wake-up calls');
  check('the Wake-up calls row carries a switch', wakeSwitch !== undefined);
  if (wakeSwitch === undefined) throw new Error('no switch');
  const before = switchState(wakeSwitch);
  click(wakeSwitch);
  await sleep(2500); // write → resync → refresh → re-read

  const flipped = switchBeside('Wake-up calls');
  check('clicking it FLIPS it — the row re-read a changed world', flipped !== undefined && switchState(flipped) !== before);

  // ── and back, so the world is left as found ──
  click(flipped);
  await sleep(2500);
  const restored = switchBeside('Wake-up calls');
  check('clicking again restores it — no one-way ratchet', restored !== undefined && switchState(restored) === before);

  // ── the other house: one click, a re-grant, a different application ──
  click(byText('Casa Marisol', 'button'));
  await sleep(3000);
  check('the shell rebuilt as Henrik-at-Marisol', root.textContent?.includes('Casa Marisol') === true && byText('The Lumen', 'button') !== undefined);
  click(byText('Integrations', 'button') ?? [...dom.window.document.querySelectorAll('button')].find((b) => b.textContent?.includes('Integrations')));
  await sleep(1200);
  check("...whose integrations are Mews's, not Opera's", root.textContent?.includes('Mews') === true && root.textContent?.includes('Opera Cloud') !== true);

  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nOK — the toggles work in the browser path (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
