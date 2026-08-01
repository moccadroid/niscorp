// The composed guest home, CLICKED: jsdom + the real registry + the real wire
// against the running dev server, signed in as Amara. The home is a list
// canvas of LIVE action instances — this drives the exact browser path: cards
// arrive from the seeds hook, a tap expands ONE card in place (per-card event
// origin through the served ActionSlot), Done collapses it, the others never
// move.
//
// Needs the dev server (pnpm dev) running.
// Run: pnpm --filter atrium exec tsx src/dev/home-probe.ts
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

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  [...dom.window.document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

const main = async (): Promise<void> => {
  const token = mintToken('amara');
  if (token === null) throw new Error('no token for amara');
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

  await sleep(3000);
  check('the shell rendered for Amara', root.textContent?.includes('Amara Osei') === true);

  // The server's shell is DURABLE per principal, so a previous run's expanded
  // card is still expanded when this one connects — the probe drives the same
  // live session a person would return to. Collapse whatever is open so the
  // run starts from the same screen every time.
  for (let i = 0; i < 6; i += 1) {
    const open = buttonByText('Collapse');
    if (open === undefined) break;
    open.click();
    await sleep(400);
  }

  // ── the composed home arrived: live preview cards, no hand-drawn grid ──
  const text = root.textContent ?? '';
  check('the wake-up card is there, collapsed', text.includes('Set for tomorrow — the desk rings.') || text.includes('on the sheet'));
  check("the bill card shows the LIVE total — no tile could", /€\d+ so far/.test(text));
  check('the late-checkout card is there', text.includes('Keep the room longer') || text.includes('request(s)'));
  check('the report card wears the SLOT title through cardTitle', text.includes('Report a problem'));

  // ── tap ONE card: it expands in place; the others stay collapsed ──
  const wakeCard = buttonByText('Set for tomorrow') ?? buttonByText('on the sheet');
  check('the wake card is tappable', wakeCard !== undefined);
  wakeCard?.click();
  await sleep(1500);
  const expanded = root.textContent ?? '';
  check('the tap expanded it IN PLACE — the switchboard times are visible', expanded.includes('05:30') && expanded.includes('09:00'));
  check('...and the bill card beside it never moved', /€\d+ so far/.test(expanded));

  // ── select a time: the choice is VISIBLE (active tile) ──
  buttonByText('06:30')?.click();
  await sleep(800);
  check('picking a time marks the tile selected', dom.window.document.querySelector('.at-tile--active') !== null);

  // ── the chevron collapses back to the preview ──
  // Icon-only, so it is found by its accessible name — which it has because
  // a glyph with no name is unusable by a screen reader too.
  buttonByText('Collapse')?.click();
  await sleep(1200);
  const collapsed = root.textContent ?? '';
  check('the chevron collapses the card back to its preview', !collapsed.includes('05:30'));

  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nOK — the composed home works in the browser (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
